function SharedTripsView({ trips, isLoading, error, onOpen, onManageFamily }) {
  return (
    <div className="page-wrap shared-trips-page">
      <section className="section-heading">
        <div>
          <p className="eyebrow">Together</p>
          <h1>Trips with you</h1>
          <p>Trips where the owner has given you viewer or contributor access.</p>
        </div>
      </section>
      {error && <p className="trip-invite-error" role="alert">{error}</p>}
      {isLoading
        ? <p className="shared-trips-empty">Loading shared trips…</p>
        : trips.length > 0
          ? <div className="shared-trips-grid">
            {trips.map((trip) => (
              <article className="shared-trip-card" key={`${trip.ownerUid}/${trip.tripId}`}>
                <span className="trip-status">{trip.role === 'editor' ? 'contributor' : trip.role}</span>
                <h2>{trip.tripName || 'Shared trip'}</h2>
                <p>
                  Shared with you · {trip.role === 'editor' || trip.role === 'contributor' ? 'You can contribute' : 'View only'}
                </p>
                <button className="text-button" type="button" onClick={() => onOpen(trip)}>
                  Open trip →
                </button>
              </article>
            ))}
          </div>
          : <div className="shared-trips-empty">
            <p>No trips have been shared with you yet.</p>
            <button className="secondary-button" type="button" onClick={onManageFamily}>
              Set up family access
            </button>
          </div>}
    </div>
  )
}

export default SharedTripsView
