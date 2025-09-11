type MarketplaceFlagProps = {
  marketplace: 'brazil' | 'usa';
  className?: string;
};

export function MarketplaceFlag({ marketplace, className = "" }: MarketplaceFlagProps) {
  // Using the flag images from your uploads
  const flagSrc = marketplace === 'brazil' 
    ? '/lovable-uploads/8ff270e0-afa4-4e34-be3d-5bf54ddeb840.png'
    : '/lovable-uploads/95977918-12a4-4d4e-839b-6be938d91d31.png';
  const alt = marketplace === 'brazil' ? 'Brazil' : 'USA';
  
  return (
    <img 
      src={flagSrc}
      alt={alt}
      className={`h-4 w-6 object-cover border border-border/50 flex-shrink-0 ${className}`}
      title={alt}
    />
  );
}