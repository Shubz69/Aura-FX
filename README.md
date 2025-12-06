# Trading Platform Frontend

This is the frontend application for the Trading Platform. It provides a user-friendly interface for accessing courses, community channels, and trading resources.

## Features

- User authentication with JWT and MFA
- Role-based access (Free, Premium, Admin)
- Course marketplace with Stripe payments
- Real-time community messaging
- AI-powered chatbot
- User profiles with XP and level system
- Leaderboard
- Admin dashboard
- Dark-themed fintech aesthetic
- Fully responsive design

## Technologies

- React.js
- React Router for navigation
- Context API for state management
- WebSockets (SockJS + STOMP) for real-time messaging
- Stripe for payments
- Responsive CSS with Media Queries
- JWT for authentication

## Prerequisites

- Node.js 16+
- npm or yarn
- Backend API running

## Setup

### Local Development

1. Clone the repository:
```bash
git clone https://github.com/username/trading-platform-frontend.git
cd trading-platform-frontend
```

2. Install dependencies:
```bash
npm install
```

3. Configure the environment:
Create a `.env` file with:
```
REACT_APP_API_URL=http://localhost:8080
```

4. Start the development server:
```bash
npm start
```

The application will be available at http://localhost:3000

### Docker Deployment

1. Build and run using Docker Compose:
```bash
docker-compose up -d
```

### Production Build

1. Create a production build:
```bash
npm run build
```

2. The build files will be in the `build` directory ready for deployment.

## Application Structure

- `/src/components` - Reusable UI components
- `/src/pages` - Page components
- `/src/context` - React context providers
- `/src/services` - API service functions
- `/src/utils` - Utility functions
- `/src/styles` - CSS stylesheets

## User Roles

1. **Free User**
   - Access to basic content
   - Limited community channels
   - Basic chatbot functionality

2. **Premium User**
   - Full course access
   - All community channels
   - Advanced chatbot features
   - Trading tools

3. **Admin**
   - User management
   - Content creation
   - Moderation capabilities
   - System analytics

## Features in Development (v2)

- Voice-enabled chatbot
- OAuth integration
- Analytics dashboard
- Mobile app version
- Multilingual support

## License

This project is proprietary and not licensed for public use.
