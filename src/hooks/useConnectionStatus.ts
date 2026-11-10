import { useEffect, useState } from 'react'
import { checkConnection, getConnectionState, subscribeConnection } from '../lib/connectionStatus'

export function useConnectionStatus() {
  const [status, setStatus] = useState(getConnectionState)

  useEffect(() => subscribeConnection(setStatus), [])

  return {
    ...status,
    retry: () => checkConnection({ immediate: true }),
  }
}
