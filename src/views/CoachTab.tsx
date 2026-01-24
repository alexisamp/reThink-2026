
import React from 'react';
import { Mic } from '../components/Icon';

interface CoachTabProps {
  userId: string;
}

const CoachTab: React.FC<CoachTabProps> = ({ userId }) => {
  return (
    <div className="h-full flex flex-col items-center justify-center animate-fade-in pb-20">
      <div className="max-w-md text-center space-y-6 px-6">
         <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
             <Mic className="w-8 h-8 text-gray-400" />
         </div>
         <h2 className="text-xl font-serif font-medium">AI Coach Disabled</h2>
         <p className="text-notion-dim text-sm italic">
            This feature has been removed as requested. Please use the Reflect tab to review your progress manually.
         </p>
      </div>
    </div>
  );
};

export default CoachTab;
