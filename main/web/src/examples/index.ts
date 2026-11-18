// Example diagrams bundled with the app (desktop issue #393). Loaded locally, no network.
import allElements from './all-elements.nsd?raw';
import coffeeProtocol from './coffee-protocol.nsd?raw';
import hilbert from './hilbert-3.nsd?raw';
import temperature from './temperature.nsd?raw';

export interface Example { id: string; title: string; xml: string }

export const EXAMPLES: Example[] = [
  { id: 'temperature', title: 'TemperatureTable (IPO, IF, FOR)', xml: temperature },
  { id: 'all', title: 'AllElements (every element type)', xml: allElements },
  { id: 'hilbert', title: 'hilbert (recursive Turtle subroutine, desktop sample)', xml: hilbert },
  { id: 'coffee', title: 'CoffeeProtocol (Friday easter egg)', xml: coffeeProtocol },
];
