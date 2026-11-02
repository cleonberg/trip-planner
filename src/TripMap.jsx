import { useEffect, useMemo } from 'react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const DEFAULT_CENTER = [37.745, -119.593]

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

function TripMap({ activities, routeCoordinates = [], routeSegments = [], selectedLocation, initialCenter, onLocationSelect }) {
  const points = useMemo(
    () => activities
      .filter((activity) => activity.coordinates)
      .map((activity) => [activity.coordinates.lat, activity.coordinates.lng]),
    [activities],
  )
  const routePositions = useMemo(
    () => routeCoordinates.map(([longitude, latitude]) => [latitude, longitude]),
    [routeCoordinates],
  )
  const markerColors = {
    planned: '#315a49',
    wishlist: '#a15e39',
    visited: '#718b73',
  }

  return (
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
      <MapViewport initialCenter={initialCenter} points={points} selectedLocation={selectedLocation} />
      {onLocationSelect && <MapClickHandler onLocationSelect={onLocationSelect} />}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
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
          radius={9}
        >
          <Popup>
            <strong>{activity.title}</strong><br />
            {activity.time}<br />
            {activity.place}
            {activity.locationDetails && <><br />{activity.locationDetails}</>}
          </Popup>
        </CircleMarker>
      ))}
      {selectedLocation && (
        <CircleMarker
          center={[selectedLocation.lat, selectedLocation.lng]}
          pathOptions={{ color: '#fff', fillColor: '#a15e39', fillOpacity: 1, weight: 3 }}
          radius={9}
        >
          <Popup>Selected location</Popup>
        </CircleMarker>
      )}
    </MapContainer>
  )
}

export default TripMap
