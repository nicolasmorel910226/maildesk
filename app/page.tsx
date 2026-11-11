import { redirect } from 'next/navigation';
import { getDashboardUser } from '../lib/auth';
import Dashboard from './dashboard';
export const dynamic='force-dynamic';
export default async function Page(){if(!await getDashboardUser())redirect('/login');return <Dashboard/>;}
