/**
 * categoryIcons.js — The icons a category may have (names in CATEGORY_ICON_NAMES,
 * utils/categoryDocument.js), as lucide components
 */

import {
  ShoppingBasket, UtensilsCrossed, Car, Receipt, House, ShoppingBag, HeartPulse, GraduationCap,
  Plane, Wifi, Gift, Landmark, TrendingUp, CircleEllipsis, Briefcase, HandCoins, Award, Laptop,
  Store, Home, CircleDollarSign, Coffee, Fuel, Bus, Baby, PawPrint, Dumbbell, Shirt, Smartphone,
  Book, Music, Film, Gamepad2, Wrench, Hammer, Pill, Stethoscope, Scissors, Sparkles, Users,
  PiggyBank, Wallet, CreditCard, Building2, Tag, Star, Heart, Zap,
} from 'lucide-react';

export const CATEGORY_ICONS = {
  ShoppingBasket, UtensilsCrossed, Car, Receipt, House, ShoppingBag, HeartPulse, GraduationCap,
  Plane, Wifi, Gift, Landmark, TrendingUp, CircleEllipsis, Briefcase, HandCoins, Award, Laptop,
  Store, Home, CircleDollarSign, Coffee, Fuel, Bus, Baby, PawPrint, Dumbbell, Shirt, Smartphone,
  Book, Music, Film, Gamepad2, Wrench, Hammer, Pill, Stethoscope, Scissors, Sparkles, Users,
  PiggyBank, Wallet, CreditCard, Building2, Tag, Star, Heart, Zap,
};

export const categoryIcon = (name) => CATEGORY_ICONS[name] || Tag;
