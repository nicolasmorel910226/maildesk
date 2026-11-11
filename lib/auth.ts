import { cookies } from 'next/headers';
import { validSession } from './local-store';
export async function getDashboardUser(){return validSession((await cookies()).get('maildesk_session')?.value)?{userId:'local-owner'}:null;}
