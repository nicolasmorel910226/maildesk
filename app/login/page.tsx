import { redirect } from 'next/navigation';
import { getDashboardUser } from '../../lib/auth';
import { hasOwner } from '../../lib/local-store';
import Login from './login';
export const dynamic='force-dynamic';
export default async function Page(){if(await getDashboardUser())redirect('/');return <Login setup={!hasOwner()}/>;}
