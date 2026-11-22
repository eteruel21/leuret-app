import type { FastifyInstance } from "fastify";

import { authenticateRequest, requireActiveUser } from "../auth/authenticate.js";
import { queryAsUser } from "../db/with-user-transaction.js";

const plans = [
  { id: "free", name: "Gratis", monthlyPriceCents: 0, includedUsers: 1, access: "calculators" },
  { id: "independent", name: "Independiente", monthlyPriceCents: 1299, includedUsers: 1, access: "full" },
  { id: "business", name: "Empresa", monthlyPriceCents: 3999, includedUsers: 5, access: "full" },
  { id: "construction", name: "Constructora", monthlyPriceCents: 9900, includedUsers: 15, access: "full" }
] as const;

type TrialRow = { kind: "standard" | "founder"; ends_at: Date; active: boolean };

export async function registerMembershipRoutes(app: FastifyInstance): Promise<void> {
  const options = { preHandler: [authenticateRequest, requireActiveUser] };

  async function getMembership(userId: string, activate: boolean) {
    const [trial] = await queryAsUser<TrialRow>(
      userId,
      "SELECT kind, ends_at, active FROM private.membership_trial($1::boolean)",
      [activate]
    );
    return {
      plan: trial?.active ? "trial" : "free",
      canStartTrial: !trial,
      trial: trial ? { kind: trial.kind, endsAt: trial.ends_at, active: trial.active } : null
    };
  }

  app.get("/membership/plans", async () => ({ currency: "USD", plans }));

  app.get("/membership", options, async (request) =>
    getMembership(request.authenticatedUser!.id, false)
  );
  app.post("/membership/trial", options, async (request) =>
    getMembership(request.authenticatedUser!.id, true)
  );
}
