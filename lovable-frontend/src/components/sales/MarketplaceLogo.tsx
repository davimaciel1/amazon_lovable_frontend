type MarketplaceLogoProps = {
  marketplace: 'amazon' | 'mercadolivre' | 'shopee';
  className?: string;
};

export function MarketplaceLogo({ marketplace, className = "" }: MarketplaceLogoProps) {
  const getLogoInfo = () => {
    switch (marketplace) {
      case 'amazon':
        return {
          src: 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg',
          alt: 'Amazon'
        };
      case 'mercadolivre':
        return {
          src: '/mercadolivre-logo.jpg',
          alt: 'Mercado Livre'
        };
      case 'shopee':
        return {
          src: 'https://logos-world.net/wp-content/uploads/2020/11/Shopee-Symbol.png',
          alt: 'Shopee'
        };
      default:
        return {
          src: 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg',
          alt: 'Amazon'
        };
    }
  };

  const { src, alt } = getLogoInfo();
  
  return (
    <img 
      src={src}
      alt={alt}
      className={`h-4 w-auto object-contain flex-shrink-0 ${className}`}
      title={alt}
    />
  );
}