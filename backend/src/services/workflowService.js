import { makeId } from "../lib/ids.js";

export function createWorkflowService(store) {
  function startRentalWorkflow(payload) {
    const workflow = {
      id: makeId("wf"),
      mode: process.env.CAMUNDA_MODE || "mock",
      rentalId: payload.rentalId,
      equipmentId: payload.equipmentId,
      renterId: payload.renterId,
      startedAt: new Date().toISOString(),
      currentStep: "PaymentCompleted",
      history: [
        {
          at: new Date().toISOString(),
          step: "StartRentalWorkflow",
          note: "Frontend called backend rental API; backend started workflow server-side."
        },
        {
          at: new Date().toISOString(),
          step: "ValidateEligibility",
          note: "Backend checked Payment service for outstanding fees and Equipment schedule overlap."
        },
        {
          at: new Date().toISOString(),
          step: "CreateRentalAndTakePayment",
          note: "Backend simulated orchestration steps that would normally be delegated to Camunda."
        }
      ]
    };

    store.workflowRuns.unshift(workflow);
    return workflow;
  }

  function continueWorkflow(rentalId, action) {
    const workflow = store.workflowRuns.find((item) => item.rentalId === rentalId);
    if (!workflow) {
      return null;
    }

    const step = {
      at: new Date().toISOString(),
      step: action,
      note: `Workflow continued server-side for rental ${rentalId}.`
    };

    workflow.history.push(step);
    workflow.currentStep = action;
    return workflow;
  }

  return {
    startRentalWorkflow,
    continueWorkflow
  };
}
