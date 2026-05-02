import { Client } from '@/types/meeting';

export function mapClientForSync(client: Client) {
  return {
    id: client.id,
    name: client.name,
    industry: client.industry,
    size: client.size,
    contactPerson: client.contactPerson,
    email: client.email,
    phone: client.phone,
    address: client.address,
    website: client.website,
    logo: client.logo,
    notes: client.notes,
    status: client.status,
    tags: client.tags || [],
    assignedCommercialId: client.assignedCommercialId,
    lastContactDate: client.lastContactDate,
    totalMeetings: client.totalMeetings || 0,
    totalRevenue: client.totalRevenue || 0,
    syncMeta: client.syncMeta,
  };
}
