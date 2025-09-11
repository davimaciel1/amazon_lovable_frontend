import React from 'react';
import { CopilotPopup } from '@copilotkit/react-ui';

export function CopilotChat() {
  return (
    <CopilotPopup 
      instructions="You are an AI assistant for an Amazon seller SaaS platform. Help users with sales data, analytics, inventory management, and platform features. You have access to their Amazon sales data and can help them understand trends, optimize their business, and make data-driven decisions."
      defaultOpen={false}
      labels={{
        title: "Amazon Seller Assistant",
        initial: "Hi! I'm your Amazon Seller Assistant. How can I help you today?",
        placeholder: "Ask me about your sales, inventory, or Amazon metrics..."
      }}
    />
  );
}