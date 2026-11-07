import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const DEFAULT_CENTER = [37.745, -119.593]
const MAP_FILTERS = [
  { id: 'planned', label: 'Planned', color: '#2563eb' },
  { id: 'visited', label: 'Visited', color: '#2e7d32' },
  { id: 'wishlist', label: 'Unassigned wish list', color: '#e27a21' },
]

function MapViewport({ points, selectedLocation, initialCenter }) {
  const map = useMap()
  const selectedLatitude = selectedLocation?.lat
  const selectedLongitude = selectedLocation?.lng
  const initialLatitude = initialCenter?.lat
  const initialLongitude = initialCenter?.lng

  useEffect(() => {
    if (points.length > 1) {
      map.fitBounds(points, { padding: [28, 28] })
    } else {
      const hasSelectedLocation = selectedLatitude !== undefined && selectedLongitude !== undefined
      const center = points[0] || (hasSelectedLocation
        ? [selectedLatitude, selectedLongitude]
        : initialLatitude !== undefined && initialLongitude !== undefined
          ? [initialLatitude, initialLongitude]
          : DEFAULT_CENTER)
      map.setView(center, hasSelectedLocation && points.length === 0 ? 14 : 12)
    }
  }, [initialLatitude, initialLongitude, map, points, selectedLatitude, selectedLongitude])

  return null
}

function MapClickHandler({ onLocationSelect }) {
  useMapEvents({
    click(event) {
      onLocationSelect({ lat: event.latlng.lat, lng: event.latlng.lng })
    },
  })

  return null
}

function MapScrollWheelZoom({ enabled }) {
  const map = useMap()

  useEffect(() => {
    map.scrollWheelZoom.disable()
    if (!enabled) return undefined

    const container = map.getContainer()
    let isWheelGestureActive = false
    let gestureTimer

    function handleWheel(event) {
      event.preventDefault()
      event.stopPropagation()
      if (event.deltaY && !isWheelGestureActive) {
        const direction = event.deltaY < 0 ? 1 : -1
        map.setZoomAround(map.mouseEventToContainerPoint(event), map.getZoom() + direction)
        isWheelGestureActive = true
      }

      window.clearTimeout(gestureTimer)
      gestureTimer = window.setTimeout(() => {
        isWheelGestureActive = false
      }, 50)
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      window.clearTimeout(gestureTimer)
      container.removeEventListener('wheel', handleWheel)
      map.scrollWheelZoom.disable()
    }
  }, [enabled, map])

  return null
}

function MapInstanceBridge({ onMapReady }) {
  const map = useMap()

  useEffect(() => {
    onMapReady(map)
  }, [map, onMapReady])

  return null
}

function MapToolbar({ map, points, mapLayer, onToggleLayer, mapFilters, onMapFilterChange }) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [toolError, setToolError] = useState('')

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === map.getContainer().parentElement)
      window.requestAnimationFrame(() => map.invalidateSize())
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [map])

  function fitAllPlaces() {
    if (points.length > 1) {
      map.fitBounds(points, { padding: [40, 40] })
    } else if (points.length === 1) {
      map.setView(points[0], 12)
    }
  }

  async function toggleFullscreen() {
    const container = map.getContainer().parentElement
    setToolError('')
    try {
      if (document.fullscreenElement === container) {
        await document.exitFullscreen()
      } else if (container.requestFullscreen) {
        await container.requestFullscreen()
      } else {
        throw new Error('Fullscreen is not supported by this browser.')
      }
    } catch (error) {
      console.error('Unable to toggle map fullscreen.', error)
      setToolError(error instanceof Error ? error.message : 'Fullscreen could not be changed.')
    }
  }

  return (
    <div className="map-toolbar" role="group" aria-label="Map controls">
      <div className="map-toolbar-actions">
        <button className="map-toolbar-button" type="button" onClick={fitAllPlaces} disabled={points.length === 0}>
          Fit all places
        </button>
        <button className="map-toolbar-button" type="button" onClick={onToggleLayer}>
          {mapLayer === 'street' ? 'Satellite' : 'Street map'}
        </button>
        <button className="map-toolbar-button" type="button" onClick={toggleFullscreen}>
          {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        </button>
      </div>
      <div className="map-toolbar-filters" role="group" aria-label="Show map markers">
        {MAP_FILTERS.map((filter) => (
          <button
            className={`map-filter-button${mapFilters[filter.id] ? ' active' : ''}`}
            type="button"
            key={filter.id}
            aria-pressed={mapFilters[filter.id]}
            onClick={() => onMapFilterChange(filter.id)}
          >
            <i style={{ backgroundColor: filter.color }} />
            {filter.label}
          </button>
        ))}
      </div>
      {toolError && <span className="map-tool-error" role="alert">{toolError}</span>}
    </div>
  )
}

function TripMap({
  activities,
  routeCoordinates = [],
  routeSegments = [],
  selectedLocation,
  initialCenter,
  onLocationSelect,
  onTripMarkerClick,
  showToolbar = false,
  scrollWheelZoom = false,
  fitActivities,
  mapFilters = {},
  onMapFilterChange,
}) {
  const [mapLayer, setMapLayer] = useState('street')
  const [mapInstance, setMapInstance] = useState(null)
  const points = useMemo(
    () => (fitActivities ?? activities)
      .filter((activity) => activity.coordinates)
      .map((activity) => [activity.coordinates.lat, activity.coordinates.lng]),
    [activities, fitActivities],
  )
  const routePositions = useMemo(
    () => routeCoordinates.map(([longitude, latitude]) => [latitude, longitude]),
    [routeCoordinates],
  )
  const routeSegmentPositions = useMemo(
    () => routeSegments.flatMap((segment) => segment.coordinates),
    [routeSegments],
  )
  const viewportPoints = useMemo(
    () => [...points, ...routePositions, ...routeSegmentPositions],
    [points, routePositions, routeSegmentPositions],
  )
  const markerColors = {
    planned: '#2563eb',
    wishlist: '#a15e39',
    visited: '#2e7d32',
  }
  const tileLayer = mapLayer === 'satellite'
    ? {
        attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      }
    : {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      }

  return (
    <div className="trip-map-shell">
      {showToolbar && mapInstance && (
        <MapToolbar
          map={mapInstance}
          points={points}
          mapLayer={mapLayer}
          onToggleLayer={() => setMapLayer((currentLayer) => currentLayer === 'street' ? 'satellite' : 'street')}
          mapFilters={mapFilters}
          onMapFilterChange={onMapFilterChange}
        />
      )}
      <MapContainer
        className="trip-map"
        center={points[0] || (selectedLocation
          ? [selectedLocation.lat, selectedLocation.lng]
          : initialCenter
            ? [initialCenter.lat, initialCenter.lng]
            : DEFAULT_CENTER)}
        zoom={12}
            scrollWheelZoom={false}
      >
        <MapInstanceBridge onMapReady={setMapInstance} />
        <MapViewport initialCenter={initialCenter} points={viewportPoints} selectedLocation={selectedLocation} />
        <MapScrollWheelZoom enabled={scrollWheelZoom} />
        {onLocationSelect && <MapClickHandler onLocationSelect={onLocationSelect} />}
        <TileLayer attribution={tileLayer.attribution} url={tileLayer.url} />
        {routePositions.length > 1 && (
          <Polyline positions={routePositions} pathOptions={{ color: '#427353', weight: 5, opacity: 0.8 }} />
        )}
        {routeSegments.map((segment, index) => (
          <Polyline
            key={`${segment.type}-${index}`}
            positions={segment.coordinates}
            pathOptions={segment.type === 'flight'
              ? { color: '#a15e39', weight: 3, opacity: 0.9, dashArray: '8 8' }
              : { color: '#427353', weight: 5, opacity: 0.8 }}
          />
        ))}
        {activities.map((activity, index) => activity.coordinates && (
          <CircleMarker
            center={[activity.coordinates.lat, activity.coordinates.lng]}
            key={activity.id ?? `${activity.time}-${activity.title}-${index}`}
            pathOptions={{ color: '#fff', fillColor: activity.mapColor ?? markerColors[activity.mapStatus] ?? '#315a49', fillOpacity: 1, weight: 3 }}
            radius={activity.mapRadius ?? 9}
            eventHandlers={activity.tripId && onTripMarkerClick
              ? { click: () => onTripMarkerClick(activity.tripId) }
              : undefined}
          >
            <Tooltip>
              <strong>{activity.title}</strong><br />
              {activity.time}<br />
              {activity.place}
              {activity.locationDetails && <><br />{activity.locationDetails}</>}
            </Tooltip>
          </CircleMarker>
        ))}
        {selectedLocation && (
          <CircleMarker
            center={[selectedLocation.lat, selectedLocation.lng]}
            pathOptions={{ color: '#fff', fillColor: '#a15e39', fillOpacity: 1, weight: 3 }}
            radius={9}
          >
            <Tooltip>Selected location</Tooltip>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  )
}

export default TripMap
