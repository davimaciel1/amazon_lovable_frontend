# CopilotKit Setup Guide

## Installation Complete! 🎉

CopilotKit has been successfully integrated into your Amazon Seller SaaS application.

## What Was Added

### Backend (amazon-unified-backend)
1. **CopilotKit Runtime** - Added `@copilotkit/runtime` package
2. **API Endpoint** - Created `/api/copilotkit` route for handling AI interactions
3. **Environment Variable** - Added `OPENAI_API_KEY` to `.env.example`

### Frontend (lovable-frontend)
1. **CopilotKit Packages** - Added:
   - `@copilotkit/react-core` - Core functionality
   - `@copilotkit/react-ui` - UI components
   - `@copilotkit/react-textarea` - Enhanced text areas

2. **Components**:
   - `CopilotProvider` - Wraps your app with CopilotKit context
   - `CopilotChat` - Floating AI assistant chat widget
   - `CopilotDemo` - Example component showing how to use CopilotKit features

3. **Environment Variable** - Added `VITE_BACKEND_URL` for backend connection

## Setup Instructions

### 1. Install Dependencies

```bash
# Backend
cd amazon-unified-backend
npm install

# Frontend
cd ../lovable-frontend
npm install
```

### 2. Configure Environment Variables

#### Backend (.env)
```env
# Add your OpenAI API key
OPENAI_API_KEY=sk-your-openai-api-key-here
```

#### Frontend (.env)
```env
# Backend URL (adjust if needed)
VITE_BACKEND_URL=http://localhost:8080
```

### 3. Start the Application

```bash
# Terminal 1 - Start backend
cd amazon-unified-backend
npm run dev

# Terminal 2 - Start frontend
cd lovable-frontend
npm run dev
```

### 4. Test the Integration

1. Open your app at `http://localhost:5173` (or your configured port)
2. Look for the chat bubble in the bottom-right corner
3. Click it to open the AI assistant
4. Try asking questions like:
   - "What are my top selling products?"
   - "Show me sales data for last month"
   - "How can I improve my Amazon listings?"

## Features Available

### 1. AI Chat Assistant
- Floating chat widget available on all pages
- Context-aware responses about Amazon selling
- Can access and analyze your sales data

### 2. Readable Data
Use `useCopilotReadable` to make data available to the AI:
```typescript
useCopilotReadable({
  description: "Sales metrics",
  value: salesData
});
```

### 3. Custom Actions
Define actions the AI can perform:
```typescript
useCopilotAction({
  name: "exportData",
  description: "Export sales data",
  handler: async ({ format }) => {
    // Your export logic
  }
});
```

### 4. Context-Aware Suggestions
The AI understands your Amazon seller context and can provide:
- Sales analysis
- Inventory recommendations
- Marketing insights
- Performance optimization tips

## Customization

### Modify AI Instructions
Edit the `instructions` prop in `CopilotChat.tsx`:
```typescript
instructions="Your custom instructions for the AI assistant..."
```

### Add More Actions
Create new actions in your components:
```typescript
useCopilotAction({
  name: "yourAction",
  description: "What this action does",
  handler: async (params) => {
    // Implementation
  }
});
```

### Style the Chat Widget
The chat widget uses your existing UI components and can be styled through:
- Tailwind classes
- Your theme configuration
- Custom CSS

## Troubleshooting

### Issue: Chat widget not appearing
- Check that CopilotProvider wraps your app in `App.tsx`
- Verify backend is running on the correct port
- Check browser console for errors

### Issue: AI not responding
- Verify `OPENAI_API_KEY` is set in backend `.env`
- Check backend logs for API errors
- Ensure backend endpoint is accessible

### Issue: Cannot connect to backend
- Verify `VITE_BACKEND_URL` matches your backend URL
- Check CORS settings in backend
- Ensure both frontend and backend are running

## Next Steps

1. **Enhance AI Context**: Add more `useCopilotReadable` hooks to provide richer data
2. **Create Custom Actions**: Build actions specific to your business needs
3. **Train on Your Data**: Customize instructions based on your specific use cases
4. **Add to More Pages**: Integrate CopilotKit features into specific workflows

## Resources

- [CopilotKit Documentation](https://docs.copilotkit.ai/)
- [React Integration Guide](https://docs.copilotkit.ai/getting-started/quickstart-react)
- [API Reference](https://docs.copilotkit.ai/reference/hooks)

## Support

For issues or questions:
- Check the [CopilotKit GitHub](https://github.com/CopilotKit/CopilotKit)
- Review the [troubleshooting guide](https://docs.copilotkit.ai/troubleshooting)
- Join the [CopilotKit Discord](https://discord.gg/copilotkit)