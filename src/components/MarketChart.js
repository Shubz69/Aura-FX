import React, { useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const MarketChart = ({ data, symbol, type = 'line' }) => {
  const chartRef = useRef(null);

  if (!data || !data.data || data.data.length === 0) {
    return <div style={{ padding: '20px', color: '#fff', textAlign: 'center' }}>No chart data available</div>;
  }

  const chartData = data.data.slice(-50); // Last 50 data points for clarity
  const labels = chartData.map(item => {
    const date = new Date(item.timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  });

  const chartConfig = {
    labels: labels,
    datasets: [
      {
        label: `${symbol} Price`,
        data: chartData.map(item => item.close || item.price),
        borderColor: 'rgb(102, 126, 234)',
        backgroundColor: type === 'line' ? 'rgba(102, 126, 234, 0.1)' : 'rgba(102, 126, 234, 0.5)',
        borderWidth: 2,
        fill: type === 'line',
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
      },
      {
        label: 'High',
        data: chartData.map(item => item.high),
        borderColor: 'rgba(34, 197, 94, 0.5)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        borderWidth: 1,
        borderDash: [5, 5],
        fill: false,
        pointRadius: 0,
      },
      {
        label: 'Low',
        data: chartData.map(item => item.low),
        borderColor: 'rgba(239, 68, 68, 0.5)',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderWidth: 1,
        borderDash: [5, 5],
        fill: false,
        pointRadius: 0,
      }
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: '#ffffff',
          font: {
            size: 12
          }
        }
      },
      title: {
        display: true,
        text: `${symbol} - Real-Time Chart`,
        color: '#ffffff',
        font: {
          size: 16,
          weight: 'bold'
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
      }
    },
    scales: {
      x: {
        ticks: {
          color: '#ffffff',
          maxRotation: 45,
          minRotation: 45,
          font: {
            size: 10
          }
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        }
      },
      y: {
        ticks: {
          color: '#ffffff',
          font: {
            size: 10
          }
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        }
      }
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    }
  };

  const ChartComponent = type === 'bar' ? Bar : Line;

  return (
    <div style={{ 
      width: '100%', 
      height: '400px', 
      margin: '20px 0',
      padding: '20px',
      background: 'rgba(255, 255, 255, 0.05)',
      borderRadius: '12px',
      border: '1px solid rgba(255, 255, 255, 0.1)'
    }}>
      <ChartComponent ref={chartRef} data={chartConfig} options={options} />
    </div>
  );
};

export default MarketChart;
