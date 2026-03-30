import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import {
  agencyRowFromSubscription,
  updateAgencyStripeFields,
} from "@/lib/stripe/sync-agency";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isUniqueViolation(err: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!err) return false;
  return (
    err.code === "23505" ||
    (err.message?.toLowerCase().includes("duplicate") ?? false)
  );
}

export async function POST(request: Request) {
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!whSecret) {
    console.error("[stripe webhook] Missing STRIPE_WEBHOOK_SECRET");
    return NextResponse.json(
      { error: "Not configured", code: "CONFIG_ERROR" },
      { status: 500 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing signature", code: "MISSING_SIGNATURE" },
      { status: 400 },
    );
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, whSecret);
  } catch (err) {
    console.error("[stripe webhook] Signature verify failed", err);
    return NextResponse.json(
      { error: "Invalid signature", code: "INVALID_SIGNATURE" },
      { status: 400 },
    );
  }

  let admin: ReturnType<typeof createAdminSupabaseClient>;
  try {
    admin = createAdminSupabaseClient();
  } catch (e) {
    console.error("[stripe webhook] Admin client", e);
    return NextResponse.json(
      { error: "Server misconfigured", code: "CONFIG_ERROR" },
      { status: 500 },
    );
  }

  const { error: insErr } = await admin.from("stripe_events").insert({
    stripe_event_id: event.id,
    type: event.type,
  });

  if (isUniqueViolation(insErr)) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (insErr) {
    console.error("[stripe webhook] stripe_events insert", insErr);
    return NextResponse.json(
      { error: "Database error", code: "DATABASE_ERROR" },
      { status: 500 },
    );
  }

  const stripe = getStripe();

  try {
    await dispatchStripeEvent(admin, stripe, event);
  } catch (e) {
    console.error("[stripe webhook] Handler error", event.type, e);
    await admin.from("stripe_events").delete().eq("stripe_event_id", event.id);
    return NextResponse.json(
      { error: "Handler failed", code: "HANDLER_ERROR" },
      { status: 500 },
    );
  }

  const { error: updErr } = await admin
    .from("stripe_events")
    .update({
      processed_at: new Date().toISOString(),
      process_error: null,
    })
    .eq("stripe_event_id", event.id);

  if (updErr) {
    console.error("[stripe webhook] processed_at update", updErr);
  }

  return NextResponse.json({ received: true });
}

async function dispatchStripeEvent(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  stripe: ReturnType<typeof getStripe>,
  event: Stripe.Event,
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") return;
      const agencyId =
        session.metadata?.agency_id ?? session.client_reference_id ?? undefined;
      if (!agencyId) {
        console.warn("[stripe webhook] checkout.session.completed bez agency_id");
        return;
      }
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id;
      const subRef = session.subscription;
      const subId = typeof subRef === "string" ? subRef : subRef?.id;
      if (!customerId || !subId) return;
      const sub = await stripe.subscriptions.retrieve(subId);
      const patch = agencyRowFromSubscription(customerId, sub);
      const { error } = await updateAgencyStripeFields(admin, agencyId, patch);
      if (error) throw error;
      return;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      await syncSubscriptionEvent(admin, stripe, sub);
      return;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const agencyId = sub.metadata?.agency_id;
      if (agencyId) {
        const patch = agencyRowFromSubscription(customerId, null);
        const { error } = await updateAgencyStripeFields(
          admin,
          agencyId,
          patch,
        );
        if (error) throw error;
      } else {
        const { data: row } = await admin
          .from("agencies")
          .select("id")
          .eq("stripe_subscription_id", sub.id)
          .maybeSingle();
        if (row?.id) {
          const patch = agencyRowFromSubscription(customerId, null);
          const { error } = await updateAgencyStripeFields(
            admin,
            row.id,
            patch,
          );
          if (error) throw error;
        }
      }
      return;
    }
    default:
      return;
  }
}

async function syncSubscriptionEvent(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  stripeClient: ReturnType<typeof getStripe>,
  sub: Stripe.Subscription,
) {
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  let agencyId = sub.metadata?.agency_id;

  if (!agencyId) {
    const { data: row } = await admin
      .from("agencies")
      .select("id")
      .eq("stripe_subscription_id", sub.id)
      .maybeSingle();
    agencyId = row?.id ?? undefined;
  }

  if (!agencyId) {
    console.warn("[stripe webhook] subscription bez agency_id", sub.id);
    return;
  }

  const full =
    sub.items?.data?.length
      ? sub
      : await stripeClient.subscriptions.retrieve(sub.id);

  const patch = agencyRowFromSubscription(customerId, full);
  const { error } = await updateAgencyStripeFields(admin, agencyId, patch);
  if (error) throw error;
}
