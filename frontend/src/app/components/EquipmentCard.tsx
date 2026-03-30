import React from 'react';
import { Equipment } from '../context/AppContext';
import { Card, CardContent, CardFooter } from './ui/card';
import { Badge } from './ui/badge';

interface EquipmentCardProps {
  equipment: Equipment;
  onClick?: () => void;
}

export const EquipmentCard: React.FC<EquipmentCardProps> = ({ equipment, onClick }) => {
  return (
    <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={onClick}>
      <CardContent className="p-0">
        <div className="aspect-square overflow-hidden rounded-t-lg">
          <img 
            src={equipment.images[0]} 
            alt={equipment.name}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-semibold text-gray-900 line-clamp-1">
              {equipment.name}
            </h3>
            <Badge variant="secondary" className="ml-2 shrink-0">
              {equipment.condition}
            </Badge>
          </div>
          <p className="text-sm text-gray-600 line-clamp-2 mb-3">
            {equipment.description}
          </p>
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-gray-900">
              ${equipment.price}/day
            </span>
            <span className="text-xs text-gray-500">
              by {equipment.ownerName}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
