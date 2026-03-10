import React, { useState } from 'react';
import AuraEnterTransition from '../../components/aura-analysis/AuraEnterTransition';
import TradeValidatorView from './TradeValidatorView';

export default function TradeValidatorEntry() {
  const [transitionDone, setTransitionDone] = useState(false);

  const handleTransitionComplete = () => {
    setTransitionDone(true);
  };

  if (!transitionDone) {
    return (
      <AuraEnterTransition
        onComplete={handleTransitionComplete}
        label="Initializing Trade Validator"
      />
    );
  }

  return <TradeValidatorView />;
}
