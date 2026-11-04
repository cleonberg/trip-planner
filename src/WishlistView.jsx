import { useEffect, useMemo, useState } from 'react'
import TripMap from './TripMap.jsx'
import PlaceSearchInput from './PlaceSearchInput.jsx'
import ScheduleItemForm from './ScheduleItemForm.jsx'

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const filters = ['All', 'Wishlist', 'Assigned', 'Scheduled', 'Visited']

function WishlistForm({ trips, onAdd, onCancel }) {
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [details, setDetails] = useState('')
  const [coordinates, setCoordinates] = useState(null)
  const [season, setSeason] = useState('')
  const [priority, setPriority] = useState('Medium')
  const [estimatedDays, setEstimatedDays] = useState('1')
  const [estimatedCost, setEstimatedCost] = useState('0')
  const [tripId, setTripId] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    onAdd({
      id: `wish-${Date.now()}`,
      name: name.trim(),
      location: location.trim(),
      details,
      coordinates,
      season: season.trim() || 'Any season',
      priority,
      estimatedDays: Number(estimatedDays),
      estimatedCost: Number(estimatedCost),
      status: tripId ? 'Assigned' : 'Wishlist',
      tripId: tripId || null,
    })
  }

  return (
    <form className="trip-create-form wishlist-create-form" onSubmit={handleSubmit}>
      <div className="section-heading compact-heading">
        <div>
          <p className="eyebrow">New idea</p>
          <h3>Add something you want to experience</h3>
        </div>
        <button className="icon-button" type="button" onClick={onCancel} aria-label="Close wish-list form">×</button>
      </div>
      <div className="trip-form-grid">
        <label className="form-field">
          <span>Experience</span>
          <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. See the northern lights" />
        </label>
        <div className="form-field">
          <span>Place</span>
          <PlaceSearchInput
            value={location}
            onChange={(value) => {
              setLocation(value)
              setDetails('')
              setCoordinates(null)
            }}
            onSelect={(place) => {
              setLocation(place.name)
              setDetails(place.details)
              setCoordinates(place.coordinates)
            }}
            details={details}
          />
        </div>
        <label className="form-field">
          <span>Best season</span>
          <input value={season} onChange={(event) => setSeason(event.target.value)} placeholder="e.g. Spring or fall" />
        </label>
        <label className="form-field">
          <span>Priority</span>
          <select value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option>High</option><option>Medium</option><option>Low</option>
          </select>
        </label>
        <label className="form-field">
          <span>Estimated days</span>
          <input required type="number" min="1" value={estimatedDays} onChange={(event) => setEstimatedDays(event.target.value)} />
        </label>
        <label className="form-field">
          <span>Estimated cost ($)</span>
          <input required type="number" min="0" value={estimatedCost} onChange={(event) => setEstimatedCost(event.target.value)} />
        </label>
        <label className="form-field wishlist-trip-select">
          <span>Assign to a trip</span>
          <select value={tripId} onChange={(event) => setTripId(event.target.value)}>
            <option value="">Keep unassigned</option>
            {trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.name} · {trip.year}</option>)}
          </select>
        </label>
      </div>
      <div className="trip-form-actions">
        <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
        <button className="primary-button" type="submit" disabled={!name.trim()}>Add to wish list</button>
      </div>
    </form>
  )
}

function WishlistView({ items, trips, onUpdateItem, onAddItem, onOpenTrip, onScheduleItem, focusItemId }) {
  const [activeFilter, setActiveFilter] = useState('All')
  const [isAdding, setIsAdding] = useState(false)
  const [schedulingItemId, setSchedulingItemId] = useState(null)
  const [highlightedItemId, setHighlightedItemId] = useState('')
  const tripById = useMemo(() => new Map(trips.map((trip) => [trip.id, trip])), [trips])
  const visibleItems = activeFilter === 'All'
    ? items
    : items.filter((item) => item.status.toLowerCase() === activeFilter.toLowerCase())
  const markers = items.filter((item) => item.coordinates).map((item) => ({
    id: item.id,
    title: item.name,
    place: item.location,
    locationDetails: item.details,
    time: item.status,
    coordinates: item.coordinates,
    mapStatus: item.status.toLowerCase(),
  }))

  useEffect(() => {
    if (!focusItemId) return undefined

    const frame = window.requestAnimationFrame(() => {
      setHighlightedItemId(focusItemId)
      const card = document.getElementById(`wishlist-item-${focusItemId}`)
      if (!card) return
      card.focus({ preventScroll: true })
      card.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    const timeout = window.setTimeout(() => setHighlightedItemId(''), 3000)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timeout)
    }
  }, [focusItemId])

  function handleAssignment(item, nextTripId) {
    if ((item.tripId ?? '') === nextTripId) return
    onUpdateItem(item.id, {
      tripId: nextTripId || null,
      status: item.status === 'Visited' ? 'Visited' : nextTripId ? 'Assigned' : 'Wishlist',
      schedule: null,
    })
  }

  return (
    <main className="wishlist-page">
      <section className="lifetime-hero wishlist-hero">
        <div>
          <p className="eyebrow">Your someday list</p>
          <h1>Keep the places you dream about in view.</h1>
          <p>Save experiences with a place, season, time, and rough cost. Assign them to a trip whenever the timing fits.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => setIsAdding((open) => !open)}>
          {isAdding ? 'Close form' : '+ Add an idea'}
        </button>
      </section>

      <section className="wishlist-map-panel">
        <div className="section-heading">
          <div><p className="eyebrow">A world of possibilities</p><h2>Wish-list map</h2></div>
          <span>{markers.length} mapped {markers.length === 1 ? 'place' : 'places'}</span>
        </div>
        {markers.length > 0
          ? <TripMap activities={markers} />
          : <p className="empty-map-message">Add a place to an idea to see it on your map.</p>}
        <div className="map-legend" aria-label="Map legend">
          <span><i className="legend-dot legend-planned" /> Planned</span>
          <span><i className="legend-dot legend-wishlist" /> Wish list</span>
          <span><i className="legend-dot legend-visited" /> Visited</span>
        </div>
      </section>

      {isAdding && (
        <WishlistForm
          trips={trips}
          onCancel={() => setIsAdding(false)}
          onAdd={(item) => {
            onAddItem(item)
            setIsAdding(false)
          }}
        />
      )}

      <section className="wishlist-list-section">
        <div className="section-heading wishlist-list-heading">
          <div><p className="eyebrow">Experiences to remember</p><h2>Wish list</h2></div>
          <div className="wishlist-filters" role="group" aria-label="Filter wish list">
            {filters.map((filter) => (
              <button
                type="button"
                key={filter}
                className={activeFilter === filter ? 'filter-chip selected' : 'filter-chip'}
                aria-pressed={activeFilter === filter}
                onClick={() => setActiveFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
        {visibleItems.length === 0
          ? <p className="wishlist-empty-state">Nothing in this group yet. Try another filter or add an idea.</p>
          : (
            <div className="wishlist-grid">
              {visibleItems.map((item) => {
                const trip = tripById.get(item.tripId)
                return (
                  <article
                    className={`wishlist-card${highlightedItemId === item.id ? ' wishlist-card-highlighted' : ''}`}
                    id={`wishlist-item-${item.id}`}
                    key={item.id}
                    tabIndex={-1}
                  >
                    <div className="wishlist-card-topline">
                      <span className={`trip-status status-${item.status.toLowerCase()}`}>{item.status}</span>
                      <span className={`priority-label priority-${item.priority.toLowerCase()}`}>{item.priority} priority</span>
                    </div>
                    <h3>{item.name}</h3>
                    <p className="wishlist-location">{item.location || 'Place not set'}</p>
                    {item.details && <p className="wishlist-details">{item.details}</p>}
                    <div className="wishlist-metrics">
                      <span>{item.season}</span>
                      <span>{item.estimatedDays} {item.estimatedDays === 1 ? 'day' : 'days'}</span>
                      <strong>{currency.format(item.estimatedCost)}</strong>
                    </div>
                    <label className="assign-trip-control">
                      <span>{trip ? 'Assigned trip' : 'Assign to a trip'}</span>
                      <select value={item.tripId ?? ''} onChange={(event) => handleAssignment(item, event.target.value)}>
                        <option value="">Keep unassigned</option>
                        {trips.map((availableTrip) => <option key={availableTrip.id} value={availableTrip.id}>{availableTrip.name} · {availableTrip.year}</option>)}
                      </select>
                    </label>
                    <div className="wishlist-card-actions">
                      {trip && <button className="text-button" type="button" onClick={() => onOpenTrip(trip)}>View {trip.year} trip →</button>}
                      {item.status !== 'Visited' && (
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => setSchedulingItemId(schedulingItemId === item.id ? null : item.id)}
                        >
                          {item.schedule ? 'Edit schedule' : 'Schedule'}
                        </button>
                      )}
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => onUpdateItem(item.id, {
                          status: item.status === 'Visited'
                            ? item.schedule ? 'Scheduled' : item.tripId ? 'Assigned' : 'Wishlist'
                            : 'Visited',
                        })}
                      >
                        {item.status === 'Visited' ? 'Mark not visited' : 'Mark visited'}
                      </button>
                    </div>
                    {schedulingItemId === item.id && (
                      <ScheduleItemForm
                        item={item}
                        trips={trips}
                        onCancel={() => setSchedulingItemId(null)}
                        onRemove={() => {
                          onUpdateItem(item.id, {
                            schedule: null,
                            status: item.tripId ? 'Assigned' : 'Wishlist',
                          })
                          setSchedulingItemId(null)
                        }}
                        onSave={(schedule) => {
                          onScheduleItem(item.id, schedule)
                          setSchedulingItemId(null)
                        }}
                      />
                    )}
                  </article>
                )
              })}
            </div>
          )}
      </section>
    </main>
  )
}

export default WishlistView
