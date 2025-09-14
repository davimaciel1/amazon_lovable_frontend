type FulfillmentBadgeProps = {
  fulfillmentType: string | null;
  className?: string;
};

export function FulfillmentBadge({ fulfillmentType, className = "" }: FulfillmentBadgeProps) {
  console.log('🟢 FulfillmentBadge RENDERING with fulfillmentType:', fulfillmentType);
  
  // Sempre mostrar um badge para depuração
  if (!fulfillmentType) {
    return (
      <span className="inline-flex items-center px-2 py-1 bg-red-500 text-white text-xs font-bold rounded">
        NULL
      </span>
    );
  }

  const getBadgeStyles = () => {
    switch (fulfillmentType.toUpperCase()) {
      case 'FBA':
        return {
          text: 'FBA',
          className: 'bg-blue-500 text-white border-blue-600'
        };
      case 'DBA':
        return {
          text: 'DBA', 
          className: 'bg-orange-500 text-white border-orange-600'
        };
      case 'FULL':
        return {
          text: 'FULL',
          className: 'bg-green-500 text-white border-green-600'
        };
      case 'FLEX':
        return {
          text: 'FLEX',
          className: 'bg-purple-500 text-white border-purple-600'
        };
      case 'OTHER':
        return {
          text: 'OTHER',
          className: 'bg-gray-500 text-white border-gray-600'
        };
      default:
        return {
          text: fulfillmentType.toUpperCase(),
          className: 'bg-yellow-500 text-black border-yellow-600'
        };
    }
  };

  const { text, className: badgeClass } = getBadgeStyles();
  
  return (
    <span 
      className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold ${badgeClass} ${className}`}
      title={`Fulfillment: ${text}`}
    >
      {text}
    </span>
  );
}