import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'IronStore · Knowledge assistant',
  description: 'Search internal company policies, procedures, and product information with document references.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
