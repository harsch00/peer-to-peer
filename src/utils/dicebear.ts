/**
 * DiceBear avatar URL helper.
 *
 * We use the public DiceBear HTTP API. The seed is the peer's full public-key
 * fingerprint so each unique identity gets a deterministic avatar.
 *
 * Fall back to a single-letter monogram when offline; the React component
 * decides which to render based on network availability.
 */
export type AvatarStyle = 'adventurer' | 'bottts' | 'lorelei' | 'pixel-art';

export function dicebearUrl(seed: string, style: AvatarStyle = 'bottts'): string {
  const params = new URLSearchParams({
    seed,
    radius: '50',
    backgroundType: 'gradientLinear',
    backgroundColor: 'b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
  });
  return `https://api.dicebear.com/9.x/${style}/png?${params.toString()}`;
}
