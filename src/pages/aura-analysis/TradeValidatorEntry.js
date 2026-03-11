import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import AuraEnterTransition from '../../components/aura-analysis/AuraEnterTransition';
import TradeValidatorView from './TradeValidatorView';

export default function TradeValidatorEntry() {
  const location = useLocation();
  const [transitionDone, setTransitionDone] = useState(false);
  const fromGateway = location.state?.fromGateway === true;

  const handleTransitionComplete = () => {
    setTransitionDone(true);
  };

  if (fromGateway && !transitionDone) {
    return (
      <AuraEnterTransition
        onComplete={handleTransitionComplete}
        label="Initializing Trade Validator"
      />
    );
  }

  return <TradeValidatorView />;
}
