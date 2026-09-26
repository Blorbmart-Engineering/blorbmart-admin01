import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import MarketManager from '../components/MarketManager'

/** Any campus's local market, opened from the Campuses page. */
export default function AdminMarket() {
  const { campusId = '' } = useParams()
  return (
    <>
      <Link
        to="/campuses"
        className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-faint hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Campuses
      </Link>
      <MarketManager campusId={campusId} />
    </>
  )
}
