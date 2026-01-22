import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Explore.css';
import CosmicBackground from '../components/CosmicBackground';
import Api from '../services/Api';
import { 
  FaUsers,
  FaGraduationCap,
  FaComments,
  FaArrowRight,
  FaHome,
  FaBook,
  FaQuestionCircle,
  FaEnvelope,
  FaRocket,
  FaLaptop,
  FaTrophy,
  FaChartLine,
  FaBuilding,
  FaBrain,
  FaRobot,
  FaBitcoin
} from 'react-icons/fa';

const Explore = () => {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);

  // Fetch courses from API
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const response = await Api.getCourses();
        let coursesData = [];
        if (Array.isArray(response.data)) {
          coursesData = response.data;
        } else if (response.data && Array.isArray(response.data.courses)) {
          coursesData = response.data.courses;
        } else if (response.data && response.data.success === false && Array.isArray(response.data.courses)) {
          coursesData = response.data.courses;
        }
        coursesData = coursesData.filter(course => 
          course && 
          course.id && 
          course.title &&
          !course.title.toLowerCase().includes('1 to 1') &&
          !course.title.toLowerCase().includes('1-on-1') &&
          !course.title.toLowerCase().includes('1 on 1')
        );
        setCourses(coursesData);
      } catch (error) {
        console.error('Error fetching courses:', error);
        setCourses([]);
      } finally {
        setLoadingCourses(false);
      }
    };

    fetchCourses();
  }, []);

  // Static courses from THE GLITCH
  const staticCourses = [
    {
      id: 'ecommerce',
      title: 'E-Commerce',
      description: 'Master Amazon FBA, Shopify, and dropshipping',
      icon: <FaLaptop />
    },
    {
      id: 'health-fitness',
      title: 'Health & Fitness',
      description: 'Build profitable fitness brands, coaching businesses, and supplement companies',
      icon: <FaTrophy />
    },
    {
      id: 'trading',
      title: 'Trading',
      description: 'Master forex, stocks, and crypto trading strategies',
      icon: <FaChartLine />
    },
    {
      id: 'real-estate',
      title: 'Real Estate',
      description: 'Master strategic property investment, REIT analysis, and PropTech opportunities (Professor - Raj Johal)',
      icon: <FaBuilding />
    },
    {
      id: 'social-media',
      title: 'Social Media',
      description: 'Build massive personal brands and monetize digital influence',
      icon: <FaUsers />
    },
    {
      id: 'psychology-mindset',
      title: 'Psychology and Mindset',
      description: 'Master the psychological aspects of trading and develop the winning mindset',
      icon: <FaBrain />
    },
    {
      id: 'algorithmic-ai',
      title: 'Algorithmic AI',
      description: 'Learn to build and deploy algorithmic trading systems powered by artificial intelligence',
      icon: <FaRobot />
    },
    {
      id: 'crypto',
      title: 'Crypto',
      description: 'Master cryptocurrency trading, blockchain technology, and DeFi strategies',
      icon: <FaBitcoin />
    }
  ];

  const sitePages = [
    {
      icon: <FaHome />,
      title: 'Home',
      description: 'Discover AURA FX and learn about our professional trading education platform. Get started with elite mentorship and proven strategies.',
      path: '/'
    },
    {
      icon: <FaBook />,
      title: 'Courses & Subscriptions',
      description: 'Browse our comprehensive trading courses and subscription plans. Choose the perfect plan for your trading journey.',
      path: '/courses'
    },
    {
      icon: <FaComments />,
      title: 'Community',
      description: 'Join 1,200+ active traders in our thriving community. Share strategies, discuss markets, and learn from experienced professionals.',
      path: '/register'
    },
    {
      icon: <FaQuestionCircle />,
      title: 'Why AURA FX',
      description: 'Learn why AURA FX is the premier choice for professional trading education. Discover our approach to consistent profitability.',
      path: '/why-glitch'
    },
    {
      icon: <FaEnvelope />,
      title: 'Contact Us',
      description: 'Get in touch with our support team. We\'re here to help with any questions about our platform, courses, or subscriptions.',
      path: '/contact'
    }
  ];

  const platformFeatures = [
    {
      icon: <FaGraduationCap />,
      title: 'Expert-Led Courses',
      description: 'Access comprehensive trading courses taught by industry professionals with verified track records. Learn institutional-grade strategies.'
    },
    {
      icon: <FaUsers />,
      title: 'Active Community',
      description: 'Connect with 1,200+ traders sharing exclusive insights, real-time market analysis, and proven trading strategies.'
    },
    {
      icon: <FaRocket />,
      title: 'Premium AI Assistant',
      description: 'Access Aura AI for professional trading analysis, market insights, and personalized trading strategies tailored to your needs.'
    }
  ];

  return (
    <div className="explore-container">
      <CosmicBackground />
      
      <div className="explore-content-wrapper">
        {/* Header Section */}
        <header className="explore-header">
          <h1 className="explore-main-title">EXPLORE</h1>
        </header>

        {/* Main Content - Split Layout */}
        <div className="explore-main-content">
          <div className="explore-text-section">
            <h2 className="explore-subtitle">Discover AURA FX</h2>
            <div className="explore-divider"></div>
            <p className="explore-text">
              Welcome to AURA FX—your gateway to professional trading education. This page will help you navigate our platform and discover everything we offer. Whether you're new to trading or looking to enhance your skills, explore our comprehensive resources designed to transform you into a consistently profitable trader.
            </p>
            <p className="explore-text">
              Our platform offers multiple ways to learn and grow. From structured courses and expert mentorship to an active trading community and advanced AI assistance, we provide the tools and knowledge you need to succeed across all major markets.
            </p>
            <p className="explore-text">
              Take your time exploring each section. Each page is designed to provide specific value—whether you're researching our courses, connecting with the community, or learning about our approach to trading education. Start your journey toward consistent profitability today.
            </p>
            <button className="explore-cta-button" onClick={() => navigate('/register')}>
              Get Started <FaArrowRight />
            </button>
          </div>

          <div className="explore-features-section">
            {platformFeatures.map((feature, index) => (
              <div key={index} className="explore-feature-card">
                <div className="explore-feature-icon">
                  {feature.icon}
                </div>
                <h3 className="explore-feature-title">{feature.title}</h3>
                <p className="explore-feature-text">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Site Pages Section */}
        <div className="explore-pages-section">
          <h2 className="explore-section-heading">Navigate Our Platform</h2>
          <p className="explore-section-description">
            Explore the different sections of AURA FX to find exactly what you need for your trading journey.
          </p>
          
          <div className="explore-pages-grid">
            {sitePages.map((page, index) => (
              <div 
                key={index} 
                className="explore-page-card"
                onClick={() => navigate(page.path)}
              >
                <div className="explore-page-icon">
                  {page.icon}
                </div>
                <h3 className="explore-page-title">{page.title}</h3>
                <p className="explore-page-description">{page.description}</p>
                <div className="explore-page-link">
                  Visit Page <FaArrowRight />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Courses Provided Section */}
        <div className="explore-courses-section">
          <h2 className="explore-section-heading">COURSES PROVIDED</h2>
          <div className="explore-courses-grid">
            {staticCourses.map((course) => (
              <div key={course.id} className="explore-course-card explore-course-card-static">
                <div className="explore-course-image-placeholder explore-course-icon-wrapper">
                  {course.icon}
                </div>
                <div className="explore-course-content">
                  <h3 className="explore-course-title">{course.title}</h3>
                  <p className="explore-course-description">
                    {course.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Section */}
        <div className="explore-footer">
          <div className="explore-footer-content">
            <span className="explore-footer-text">Courses Provided</span>
            <span className="explore-footer-separator">•</span>
            <span className="explore-footer-powered">
              powered by <strong>THE GLITCH</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Explore;
