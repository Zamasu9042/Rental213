import React, { useEffect, useMemo, useState } from "react";
import {
  completeInspection,
  createRental,
  getAssumptions,
  getConfig,
  getEquipment,
  listClaims,
  listRentals,
  requestReturn,
  submitDamageClaim
} from "./api";

const useMocks = import.meta.env.VITE_USE_MOCKS !== "false";

const initialRentalForm = {
  renterId: useMocks ? "demo-renter-001" : "1001",
  equipmentId: "",
  startTime: "",
  endTime: ""
};

const initialClaimForm = {
  rentalId: "",
  damageType: "",
  notes: "",
  photoFile: null,
  autoAnalyze: true
};

function toLocalDateTimeInput(isoValue) {
  if (!isoValue) {
    return "";
  }
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function formatDateRange(startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  return `${start.toLocaleString()} - ${end.toLocaleString()}`;
}

export default function App() {
  const config = useMemo(() => getConfig(), []);
  const [equipment, setEquipment] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [claims, setClaims] = useState([]);
  const [assumptions, setAssumptions] = useState([]);
  const [rentalForm, setRentalForm] = useState(initialRentalForm);
  const [claimForm, setClaimForm] = useState(initialClaimForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Ready.");

  async function refreshAll() {
    setLoading(true);
    try {
      const renterKey = rentalForm.renterId || initialRentalForm.renterId;
      const [equipmentData, rentalsData, claimsData, assumptionsData] = await Promise.all([
        getEquipment(),
        listRentals(renterKey),
        listClaims(),
        getAssumptions()
      ]);
      setEquipment(equipmentData);
      setRentals(rentalsData);
      setClaims(claimsData);
      setAssumptions(assumptionsData);
    } catch (error) {
      setMessage(error.message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  async function handleCreateRental(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("Creating rental...");
    try {
      const rental = await createRental(rentalForm);
      setRentalForm(initialRentalForm);
      await refreshAll();
      setMessage(
        config.microserviceMode
          ? `Rental ${rental.id} created (${rental.status}). Owner: ${rental.ownerName} · ${rental.ownerPhone}`
          : `Rental ${rental.id} confirmed via workflow ${rental.workflowId}. Owner contact: ${rental.ownerName} ${rental.ownerPhone}`
      );
    } catch (error) {
      setMessage(error.message || "Could not create rental.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestReturn(rentalId) {
    setBusy(true);
    setMessage(`Requesting return for ${rentalId}...`);
    try {
      await requestReturn(rentalId);
      await refreshAll();
      setMessage(`Rental ${rentalId} is now pending inspection.`);
    } catch (error) {
      setMessage(error.message || "Could not request return.");
    } finally {
      setBusy(false);
    }
  }

  async function handleApproveReturn(rentalId) {
    setBusy(true);
    setMessage(`Completing inspection for ${rentalId}...`);
    try {
      await completeInspection(rentalId, "NoDamage");
      await refreshAll();
      setMessage(`Rental ${rentalId} completed and equipment released.`);
    } catch (error) {
      setMessage(error.message || "Could not complete inspection.");
    } finally {
      setBusy(false);
    }
  }

  const canInspect = config.useMocks;

  async function handleSubmitClaim(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("Submitting damage claim...");
    try {
      const claim = await submitDamageClaim({
        rentalId: claimForm.rentalId,
        damageType: claimForm.damageType,
        notes: claimForm.notes,
        photoFile: claimForm.photoFile || undefined,
        autoAnalyze: claimForm.autoAnalyze
      });
      setClaimForm(initialClaimForm);
      await refreshAll();
      setMessage(
        claim.estimateAmount != null
          ? `Claim ${claim.id} — estimate $${claim.estimateAmount}.`
          : `Claim ${claim.id} submitted (${claim.status}).`
      );
    } catch (error) {
      setMessage(error.message || "Could not submit damage claim.");
    } finally {
      setBusy(false);
    }
  }

  function loadReservationWindow(item) {
    const firstWindow = item.reservedWindows?.[0];
    if (!firstWindow) {
      return;
    }
    setRentalForm((current) => ({
      ...current,
      equipmentId: item.id,
      startTime: toLocalDateTimeInput(firstWindow.startTime),
      endTime: toLocalDateTimeInput(firstWindow.endTime)
    }));
    setMessage(
      `Loaded the first reserved window for ${item.name}. Submitting now should trigger the overlap protection.`
    );
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">P2P Rental Platform</p>
          <h1>Reference UI with the three fixes implemented</h1>
          <p className="subtext">
            Mock mode uses in-browser data. With <code>VITE_USE_MOCKS=false</code>, the UI
            talks to your Docker microservices through the Vite proxy (<code>/services/*</code>
            → ports 8001, 8002, 8004, 8006). Start compose first, then <code>npm run dev</code>.
          </p>
        </div>
        <div className="config-card">
          <h2>Runtime</h2>
          <dl>
            <div>
              <dt>Mock mode</dt>
              <dd>{String(config.useMocks)}</dd>
            </div>
            <div>
              <dt>API / proxy</dt>
              <dd>{config.apiBaseUrl}</dd>
            </div>
            <div>
              <dt>Microservices</dt>
              <dd>{String(config.microserviceMode)}</dd>
            </div>
          </dl>
        </div>
      </header>

      <section className="status-bar">
        <strong>Status:</strong> <span>{message}</span>
      </section>

      <main className="grid">
        <section className="panel">
          <h2>Implemented assumptions</h2>
          <ul className="text-list">
            {assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Quick demo checklist</h2>
          <ul className="text-list">
            <li>
              {config.microserviceMode
                ? "Use renter 1001 or 1002 and numeric equipment ids from the catalog."
                : "Create a normal rental with eq-1001."}
            </li>
            <li>
              Click <strong>Load first reserved slot</strong> when reserved windows exist to
              test overlap protection.
            </li>
            {!config.microserviceMode ? (
              <li>
                Use renter <code>blocked-renter-001</code> to trigger unpaid-fee blocking (mock
                only).
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel panel-wide">
          <div className="panel-head">
            <h2>Equipment catalog</h2>
            <button onClick={refreshAll} disabled={loading || busy}>
              Refresh
            </button>
          </div>

          {loading ? (
            <p>Loading equipment...</p>
          ) : (
            <div className="cards">
              {equipment.map((item) => (
                <article key={item.id} className="card">
                  <div className="card-top">
                    <div>
                      <h3>{item.name}</h3>
                      <p className="muted">{item.category}</p>
                    </div>
                    <span
                      className={`badge badge-${item.status.toLowerCase().replace(/\s+/g, "")}`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <p>{item.description}</p>
                  <ul className="meta-list">
                    <li>Rate: ${item.hourlyRate}/hour</li>
                    <li>Pickup: {item.location}</li>
                    <li>Owner via UserProfile: {item.ownerName}</li>
                    <li>Phone via UserProfile: {item.ownerPhone}</li>
                  </ul>

                  {item.reservedWindows?.length > 0 ? (
                    <div className="hint-box">
                      <strong>Reserved windows</strong>
                      <ul className="reservation-list">
                        {item.reservedWindows.map((reservation) => (
                          <li key={reservation.rentalId}>
                            {formatDateRange(reservation.startTime, reservation.endTime)} ({reservation.status})
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="hint">No conflicting reservations are seeded for this item.</p>
                  )}

                  <div className="button-row">
                    <button
                      disabled={
                        busy || String(item.status).toLowerCase() !== "available"
                      }
                      onClick={() =>
                        setRentalForm((current) => ({ ...current, equipmentId: item.id }))
                      }
                    >
                      Use for rental form
                    </button>
                    {item.reservedWindows?.length > 0 ? (
                      <button disabled={busy} onClick={() => loadReservationWindow(item)}>
                        Load first reserved slot
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Create rental</h2>
          <form className="form" onSubmit={handleCreateRental}>
            <label>
              Renter ID
              <input
                value={rentalForm.renterId}
                onChange={(event) =>
                  setRentalForm((current) => ({ ...current, renterId: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Equipment ID
              <input
                value={rentalForm.equipmentId}
                onChange={(event) =>
                  setRentalForm((current) => ({ ...current, equipmentId: event.target.value }))
                }
                placeholder="Click an item card above"
                required
              />
            </label>
            <label>
              Start time
              <input
                type="datetime-local"
                value={rentalForm.startTime}
                onChange={(event) =>
                  setRentalForm((current) => ({ ...current, startTime: event.target.value }))
                }
                required
              />
            </label>
            <label>
              End time
              <input
                type="datetime-local"
                value={rentalForm.endTime}
                onChange={(event) =>
                  setRentalForm((current) => ({ ...current, endTime: event.target.value }))
                }
                required
              />
            </label>
            <p className="hint">
              The backend converts these values to ISO timestamps and checks for rental
              overlap before confirming the booking.
            </p>
            <button type="submit" disabled={busy}>
              Create rental
            </button>
          </form>
        </section>

        <section className="panel panel-wide">
          <h2>Rentals and return flow</h2>
          {rentals.length === 0 ? (
            <p>No rentals yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Rental ID</th>
                    <th>Equipment</th>
                    <th>Window</th>
                    <th>Status</th>
                    {!config.microserviceMode ? <th>Payment</th> : null}
                    {!config.microserviceMode ? <th>Workflow</th> : null}
                    <th>Owner contact</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rentals.map((rental) => (
                    <tr key={rental.id}>
                      <td>{rental.id}</td>
                      <td>{rental.equipmentId}</td>
                      <td>{formatDateRange(rental.startTime, rental.endTime)}</td>
                      <td>{rental.status}</td>
                      {!config.microserviceMode ? <td>{rental.paymentStatus}</td> : null}
                      {!config.microserviceMode ? (
                        <td className="mono">{rental.workflowId || "-"}</td>
                      ) : null}
                      <td>
                        {rental.ownerName}
                        <br />
                        {rental.ownerPhone}
                      </td>
                      <td className="actions">
                        <button
                          disabled={
                            busy ||
                            rental.status === "Completed" ||
                            rental.status === "PendingPayment" ||
                            (config.microserviceMode
                              ? rental.status !== "Active"
                              : !["Active", "Confirmed", "InUse", "ReturnRequested"].includes(
                                  rental.status
                                ))
                          }
                          onClick={() => handleRequestReturn(rental.id)}
                        >
                          {config.microserviceMode ? "Return item" : "Request return"}
                        </button>
                        {canInspect ? (
                          <button
                            disabled={busy || rental.status !== "PendingInspection"}
                            onClick={() => handleApproveReturn(rental.id)}
                          >
                            Approve no-damage return
                          </button>
                        ) : null}
                        <button
                          disabled={busy}
                          onClick={() =>
                            setClaimForm((current) => ({ ...current, rentalId: rental.id }))
                          }
                        >
                          Use for claim form
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Damage claim</h2>
          <form className="form" onSubmit={handleSubmitClaim}>
            <label>
              Rental ID
              <input
                value={claimForm.rentalId}
                onChange={(event) =>
                  setClaimForm((current) => ({ ...current, rentalId: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Damage type
              <input
                value={claimForm.damageType}
                onChange={(event) =>
                  setClaimForm((current) => ({ ...current, damageType: event.target.value }))
                }
                placeholder="handle grip damage"
                required
              />
            </label>
            <label>
              Notes
              <textarea
                value={claimForm.notes}
                onChange={(event) =>
                  setClaimForm((current) => ({ ...current, notes: event.target.value }))
                }
                rows="4"
              />
            </label>
            {config.microserviceMode ? (
              <label>
                Photo (optional — enables Vision analyze)
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    setClaimForm((current) => ({
                      ...current,
                      photoFile: event.target.files?.[0] || null
                    }))
                  }
                />
              </label>
            ) : null}
            {config.microserviceMode ? (
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={claimForm.autoAnalyze}
                  onChange={(event) =>
                    setClaimForm((current) => ({
                      ...current,
                      autoAnalyze: event.target.checked
                    }))
                  }
                />
                Run analyze after photo upload
              </label>
            ) : null}
            <button type="submit" disabled={busy}>
              Submit claim
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>Claims</h2>
          {claims.length === 0 ? (
            <p>No claims yet.</p>
          ) : (
            <ul className="claim-list">
              {claims.map((claim) => (
                <li key={claim.id}>
                  <strong>{claim.id}</strong>
                  <span>{claim.damageType}</span>
                  <span>
                    {claim.status} / severity {claim.severity} / confidence {claim.confidence}
                  </span>
                  <span>
                    Estimate:{" "}
                    {claim.estimateAmount != null ? `$${claim.estimateAmount}` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
