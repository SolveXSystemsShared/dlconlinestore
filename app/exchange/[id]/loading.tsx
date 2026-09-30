import { SkeletonPage } from "@/components/skeleton"
import { StoreHeader } from "@/components/store-header"
import { LoadingLine } from "@/components/slow-notice"

/** Shown while the confirmation is fetched on the server — instant on a slow connection. */
export default function Loading() {
  return <div className="sf">
    <StoreHeader />
    <main className="sf-main">
      <section className="sf-hero"><div><p className="sf-kicker">EXCHANGE REQUEST</p><h1 className="sf-title">Just a<br />moment.</h1></div></section>
      <div className="sf-body"><LoadingLine context="exchange" /></div>
      <SkeletonPage label="Loading your exchange request" />
    </main>
  </div>
}
