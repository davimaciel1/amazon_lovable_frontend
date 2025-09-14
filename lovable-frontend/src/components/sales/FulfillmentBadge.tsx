type FulfillmentBadgeProps = {
  fulfillmentType: string | null;
  className?: string;
};

export function FulfillmentBadge({ fulfillmentType, className = "" }: FulfillmentBadgeProps) {
  if (!fulfillmentType) {
    return null;
  }

  const getBadgeStyles = () => {
    switch (fulfillmentType.toUpperCase()) {
      case 'FBA':
        return {
          text: 'FBA',
          className: 'bg-blue-100 text-blue-800 border-blue-200'
        };
      case 'DBA':
        return {
          text: 'DBA', 
          className: 'bg-orange-100 text-orange-800 border-orange-200'
        };
      case 'FULL':
        return {
          text: 'FULL',
          className: 'bg-green-100 text-green-800 border-green-200'
        };
      case 'FLEX':
        return {
          text: 'FLEX',
          className: 'bg-purple-100 text-purple-800 border-purple-200'
        };
      case 'OTHER':
        return {
          text: 'OTHER',
          className: 'bg-gray-100 text-gray-800 border-gray-200'
        };
      default:
        return {
          text: fulfillmentType.toUpperCase(),
          className: 'bg-gray-100 text-gray-800 border-gray-200'
        };
    }
  };

  const { text, className: badgeClass } = getBadgeStyles();
  
  return (
    <span 
      className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-xs font-medium border ${badgeClass} ${className}`}
      title={`Fulfillment: ${text}`}
    >
      {text}
    </span>
  );
}