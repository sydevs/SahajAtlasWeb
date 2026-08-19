// `CompactCard` (presentational, ./CompactCard) stays module-private — only
// DynamicCompactCard, the story and the markup spec consume it, and all three import it
// directly. The container lives in its own module so importing the presentational card
// doesn't drag in the api/i18n graph.
export { DynamicCompactCard } from './DynamicCompactCard'
