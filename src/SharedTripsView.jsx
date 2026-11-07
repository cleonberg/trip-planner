function SharedTripsView({ trips, isLoading, error, onOpen }) {
  return (
    <div className="page-wrap shared-trips-page">
      <section className="section-heading">
        <div>
          <p className="eyebrow">Together</p>
          <h1>Shared trips</h1>
          <p>Trips other people have invited you to view or help plan.</p>
        </div>
      </section>
      {error && <p className="trip-invite-error" role="alert">{error}</p>}
      {isLoading
        ? <p className="shared-trips-empty">Loading shared trips…</p>
        : trips.length > 0
          ? <div className="shared-trips-grid">
            {trips.map((trip) => (
              <article className="shared-trip-card" key={`${trip.ownerUid}/${trip.tripId}`}>
                <span className="trip-status">{trip.role}</span>
                <h2>{trip.tripName || 'Shared trip'}</h2>
                <p>Shared with you · {trip.role === 'editor' ? 'You can contribute' : 'View only'}</p>
                <button className="text-button" type="button" onClick={() => onOpen(trip)}>
                  Open trip →
                </button>
              </article>
            ))}
          </div>
          : <p className="shared-trips-empty">No one has shared a trip with you yet.</p>}
    </div>
  )
}

export default SharedTripsView
