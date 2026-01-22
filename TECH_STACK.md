# AURA FX - Complete Tech Stack Documentation

## 🎯 Overview
AURA FX is a full-stack trading education platform built with modern web technologies, featuring real-time market data, AI-powered trading assistance, community features, and subscription management.

---

## 🖥️ **Frontend Stack**

### Core Framework
- **React.js 18.2.0** - Main frontend framework
- **React Router DOM 6.16.0** - Client-side routing
- **Create React App 5.0.1** - Build tooling and development environment

### UI Libraries & Components
- **Material-UI (MUI) 5.14.12** - Component library
  - `@mui/material` - Core components
  - `@mui/icons-material` - Icon set
  - `@emotion/react` & `@emotion/styled` - CSS-in-JS styling engine

### Icons & Visual Elements
- **React Icons 5.5.0** - Icon library (Font Awesome, Bootstrap, etc.)
- **Chart.js 4.4.0** - Data visualization
- **React Chart.js 2 5.2.0** - React wrapper for Chart.js

### Forms & Validation
- **Formik 2.4.5** - Form management
- **Yup 1.3.0** - Schema validation

### UI Enhancements
- **React Toastify 9.1.3** - Toast notifications
- **React Markdown 9.0.0** - Markdown rendering
- **React Syntax Highlighter 15.5.0** - Code syntax highlighting

### Utilities
- **Moment.js 2.30.1** - Date/time manipulation
- **Axios 1.5.1** - HTTP client
- **JWT Decode 4.0.0** - JWT token decoding

---

## 🔧 **Backend Stack**

### Runtime & Framework
- **Node.js 18+** - JavaScript runtime
- **Express.js 5.1.0** - Web application framework
- **Vercel Serverless Functions** - API endpoints (serverless architecture)

### Database
- **MySQL 8.0** - Primary database (hosted on Railway)
  - **mysql2 3.6.5** - MySQL client with promise support
  - Connection pooling for high-performance queries
- **SQLite3** (better-sqlite3 9.2.2) - Local/fallback database
  - Used for password reset codes and local development

### Authentication & Security
- **JSON Web Token (JWT) 9.0.3** - Authentication tokens
- **Bcrypt 5.1.1** - Password hashing
- **Crypto-JS 4.1.1** - Additional encryption utilities

### Payment Processing
- **Stripe 19.1.0** - Payment gateway integration
  - Subscription management
  - Direct checkout
  - Webhook handling

### Email Services
- **Nodemailer 7.0.10** - Email sending
  - Gmail SMTP integration
  - Email verification
  - Password reset emails

### Web Scraping & Data
- **Cheerio 1.1.2** - HTML parsing and web scraping
  - Used for Forex Factory calendar scraping
  - Market news aggregation

### Real-Time Communication
- **WebSocket** - Real-time messaging
- **SockJS Client 1.6.1** - WebSocket fallback
- **STOMP.js 7.1.1** - Messaging protocol over WebSocket

### CORS & Middleware
- **CORS 2.8.5** - Cross-origin resource sharing

---

## 🤖 **AI & Machine Learning**

### AI Services
- **OpenAI API 6.16.0** - AI-powered trading assistant
  - GPT-4 integration
  - Custom trading tools and functions
  - Market analysis and recommendations

### Market Data APIs
- **Finnhub API** - Real-time market data (TradingView-compatible)
  - OANDA spot prices for forex/commodities
  - Stock, crypto, and commodity quotes
- **Yahoo Finance API** - Market data fallback
- **Alpha Vantage API** - Additional market data source
- **Twelve Data API** - Real-time quotes
- **Metal API** - Precious metals pricing
- **ExchangeRate-API** - Forex rates

---

## 🚀 **Deployment & Infrastructure**

### Hosting & Deployment
- **Vercel** - Frontend and API hosting
  - Serverless functions
  - Automatic deployments from GitHub
  - Edge network distribution
- **Railway** - Database and WebSocket server hosting
  - MySQL database service
  - WebSocket server for real-time features

### Build Tools
- **React Scripts** - Build and development server
- **ESLint** - Code linting
- **Webpack** (via CRA) - Module bundling

### Version Control
- **Git** - Source control
- **GitHub** - Repository hosting

---

## 📦 **Project Structure**

```
AURA FX/
├── src/                    # React frontend source
│   ├── components/         # Reusable React components
│   ├── pages/             # Page components
│   ├── styles/            # CSS stylesheets
│   ├── services/          # API service layer
│   └── context/           # React Context providers
├── api/                    # Backend API endpoints
│   ├── auth/              # Authentication endpoints
│   ├── ai/                # AI and market data endpoints
│   ├── community/         # Community features
│   ├── stripe/            # Payment processing
│   └── admin/             # Admin functionality
├── websocket-server/       # WebSocket server (Railway)
├── public/                # Static assets
└── vercel.json            # Vercel configuration
```

---

## 🔌 **Third-Party Integrations**

### Trading & Market Data
- **TradingView** - Webhook integration for alerts
- **Forex Factory** - Economic calendar scraping
- **Multiple Market Data Providers** - Aggregated real-time data

### Communication
- **Gmail SMTP** - Email delivery
- **WebSocket** - Real-time messaging

### Analytics & Monitoring
- **Vercel Analytics** - Performance monitoring
- **Web Vitals 2.1.4** - Core web vitals tracking

---

## 🛠️ **Development Tools**

### Testing
- **Jest** - Testing framework (via React Scripts)
- **React Testing Library** - Component testing
  - `@testing-library/react 13.4.0`
  - `@testing-library/jest-dom 5.17.0`
  - `@testing-library/user-event 13.5.0`

### Code Quality
- **ESLint** - Linting
- **Prettier** (implicit) - Code formatting

---

## 📊 **Key Features & Technologies**

### Real-Time Features
- Live market data ticker (updates every 10 seconds)
- WebSocket-based messaging
- Real-time community presence

### AI Features
- OpenAI GPT-4 integration
- Custom trading tools
- Market analysis
- Image analysis capabilities

### Payment & Subscriptions
- Stripe integration
- Subscription tier management
- Payment webhooks

### Security
- JWT-based authentication
- Bcrypt password hashing
- SSL/TLS encryption
- CORS protection

---

## 🌐 **Browser Support**

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

---

## 📝 **Environment Variables Required**

### Database
- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`
- `MYSQL_SSL`

### Authentication
- `JWT_SECRET`

### Payment
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`

### Email
- `EMAIL_USER`
- `EMAIL_PASS`

### AI Services
- `OPENAI_API_KEY`

### Market Data (Optional)
- `FINNHUB_API_KEY`
- `ALPHA_VANTAGE_API_KEY`
- `TWELVE_DATA_API_KEY`
- `METAL_API_KEY`
- `NEWS_API_KEY`

---

## 🎨 **Styling Approach**

- **CSS Modules** - Component-scoped styles
- **Emotion** - CSS-in-JS (via MUI)
- **Custom CSS** - Traditional stylesheets
- **Responsive Design** - Mobile-first approach

---

## 📈 **Performance Optimizations**

- Database connection pooling (100 connections)
- Parallel API requests for market data
- Code splitting (React Router)
- Lazy loading components
- Edge caching (Vercel)
- WebSocket connection pooling

---

## 🔄 **Update Frequency**

- **Market Data**: Every 10 seconds (24/7)
- **Real-Time Messages**: Instant via WebSocket
- **User Presence**: Real-time updates

---

## 📚 **Documentation Files**

- `README.md` - Project overview
- `DATABASE_CONNECTION_INFO.md` - Database setup
- `VERCEL_ENV_SETUP.md` - Deployment configuration
- `PERFORMANCE_AND_SCALING_GUIDE.md` - Performance tips
- `ENVIRONMENT_VARIABLES_SETUP.md` - Environment setup

---

**Last Updated**: 2024
**Maintained By**: AURA FX Development Team
