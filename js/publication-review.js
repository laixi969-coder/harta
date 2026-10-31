// A manual check applies only to the exact account, link and publication time checked.
export function publicationReviewCurrent(publication) {
  const review=publication?.commentReview;
  return Boolean(review && review.url===publication.url && review.publishedAt===publication.publishedAt && review.accountId===publication.accountId && Number.isFinite(Date.parse(review.checkedAt)) && Date.parse(review.checkedAt)>=Date.parse(publication.publishedAt));
}
export function pendingPublicationReviews(acquisition={},customerId,now=Date.now()) {
  const delay=48*60*60*1000;
  return (acquisition.publications || []).filter(p=>p.customerId===customerId && p.status==='published' && !p.demo && p.source!=='demo' && p.sourceType!=='demo' && p.url && Number.isFinite(Date.parse(p.publishedAt)) && Date.parse(p.publishedAt)<=now-delay && !publicationReviewCurrent(p)).sort((a,b)=>Date.parse(a.publishedAt)-Date.parse(b.publishedAt));
}
