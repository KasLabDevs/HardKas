export const WORKFLOW_TEMPLATES: Record<string, any> = {
  basic: {
    steps: [
      { id: "step1", action: "noop" }
    ]
  },
  payroll: {
    steps: [
      { id: "validate_funds", action: "check_balance" },
      { id: "distribute", action: "batch_transfer", dependsOn: ["validate_funds"] }
    ]
  },
  dao: {
    steps: [
      { id: "propose", action: "create_proposal" },
      { id: "vote", action: "collect_votes", dependsOn: ["propose"] },
      { id: "execute", action: "execute_proposal", dependsOn: ["vote"] }
    ]
  },
  escrow: {
    steps: [
      { id: "deposit", action: "lock_funds" },
      { id: "release", action: "release_funds", dependsOn: ["deposit"] }
    ]
  },
  marketplace: {
    steps: [
      { id: "list_item", action: "create_listing" },
      { id: "purchase", action: "buy_item", dependsOn: ["list_item"] }
    ]
  }
};
