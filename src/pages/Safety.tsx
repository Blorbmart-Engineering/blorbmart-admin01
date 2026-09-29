import { adminApi } from '../lib/api'
import SafetyAlerts from '../components/SafetyAlerts'

/**
 * SOS alerts from every campus. Admins are paged for all of them, and are the
 * only people paged on a campus with no head of operations.
 */
export default function Safety() {
  return <SafetyAlerts api={adminApi.safety} queryKey="admin-safety" scope="across every campus" />
}
