import { campusApi } from '../../lib/api'
import SafetyAlerts from '../../components/SafetyAlerts'

/** SOS alerts raised on this campus. The server scopes the list to it. */
export default function CampusSafety() {
  return <SafetyAlerts api={campusApi.safety} queryKey="campus-safety" scope="on your campus" />
}
