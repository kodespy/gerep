/** Distancia en metros entre dos coordenadas (Haversine). */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function isInsideGeofence(
  userLat: number,
  userLng: number,
  centerLat: number,
  centerLng: number,
  radiusMeters: number,
): { inside: boolean; distance: number } {
  const distance = distanceMeters(userLat, userLng, centerLat, centerLng)
  return { inside: distance <= radiusMeters, distance }
}

export function getCurrentPosition(options?: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Este navegador no soporta geolocalización.'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, err => {
      const msg =
        err.code === err.PERMISSION_DENIED
          ? 'Permiso de ubicación denegado. Activá la ubicación para marcar asistencia.'
          : err.code === err.POSITION_UNAVAILABLE
            ? 'No se pudo obtener la ubicación.'
            : 'Tiempo de espera al obtener la ubicación.'
      reject(new Error(msg))
    }, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
      ...options,
    })
  })
}
