// API configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1337';
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN;

export const api = {
  baseURL: API_BASE_URL,
  endpoints: {
    batches: '/api/batches',
    pieces: '/api/pieces',
    defects: '/api/defects',
    materials: '/api/materials',
    productionLines: '/api/production-lines',
    stats: '/api/stats',
    alerts: '/api/alerts',
    auth: {
      login: '/api/auth/local',
      logout: '/api/auth/logout',
      me: '/api/users/me',
    },
    upload: '/api/upload',
  },
  headers: {
    'Content-Type': 'application/json',
    ...(API_TOKEN && { Authorization: `Bearer ${API_TOKEN}` }),
  },
};

// Helper function to get auth token from localStorage
export const getAuthToken = (): string | null => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('authToken');
  }
  return null;
};

// Helper function to set auth token
export const setAuthToken = (token: string): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('authToken', token);
  }
};

// Helper function to remove auth token
export const removeAuthToken = (): void => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('authToken');
  }
};

// Helper function to get headers with auth token
export const getHeaders = (): HeadersInit => {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
};

// Fetch dashboard statistics
export const fetchDashboardStats = async () => {
  try {
    const response = await fetch(
      `${API_BASE_URL}${api.endpoints.stats}?sort=createdAt:desc&pagination[limit]=1&populate=*`,
      {
        headers: getHeaders(),
        credentials: 'include',
      }
    );
    if (!response.ok) throw new Error('Failed to fetch stats');

    const data = await response.json();
    return data.data?.[0] || null;
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    throw error;
  }
};

// Fetch recent alerts
export const fetchRecentAlerts = async (limit = 10) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}${api.endpoints.alerts}?sort=createdAt:desc&pagination[limit]=${limit}&populate=*`,
      {
        headers: getHeaders(),
        credentials: 'include',
      }
    );
    if (!response.ok) throw new Error('Failed to fetch alerts');
    return await response.json();
  } catch (error) {
    console.error('Error fetching recent alerts:', error);
    throw error;
  }
};

// Fetch active batch
export const fetchActiveBatch = async () => {
  try {
    const response = await fetch(
      `${API_BASE_URL}${api.endpoints.batches}?sort=createdAt:desc&pagination[limit]=1&populate=*&publicationState=preview`,
      {
        headers: getHeaders(),
        credentials: 'include',
      }
    );
    if (!response.ok) throw new Error('Failed to fetch active batch');
    const data = await response.json();
    return data.data?.[0] || null;
  } catch (error) {
    console.error('Error fetching active batch:', error);
    throw error;
  }
};

// Generate piece number based on batch
export const generatePieceNumber = async (batchId: string) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}${api.endpoints.pieces}?filters[batch][documentId][$eq]=${batchId}&sort=createdAt:desc`,
      {
        headers: getHeaders(),
        credentials: 'include',
      }
    );
    if (!response.ok) throw new Error('Failed to fetch pieces');
    const data = await response.json();
    const pieceCount = data.data?.length || 0;
    return pieceCount + 1;
  } catch (error) {
    console.error('Error generating piece number:', error);
    throw error;
  }
};

// Upload image
export const uploadImage = async (file: File) => {
  try {
    const formData = new FormData();
    formData.append('files', file);

    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}${api.endpoints.upload}`, {
      method: 'POST',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      credentials: 'include',
      body: formData,
    });

    if (!response.ok) throw new Error('Failed to upload image');
    return await response.json();
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
};

export const createDefect = async (defectData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}${api.endpoints.defects}`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify({ data: defectData }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || 'Failed to create defect');
    }
    return data;
  } catch (error) {
    console.error('Error creating defect:', error);
    throw error;
  }
};

// Logout function
export const logout = async () => {
  removeAuthToken();
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
};

// Fetch unique defect_type values from the defects table (includes drafts)
export const fetchDefectTypes = async (): Promise<string[]> => {
  try {
    const response = await fetch(
      `${API_BASE_URL}${api.endpoints.defects}?publicationState=preview&pagination[pageSize]=200&fields[0]=defect_type`,
      {
        headers: getHeaders(),
        credentials: 'include',
      }
    );
    if (!response.ok) throw new Error('Failed to fetch defect types');
    const data = await response.json();

    // Strapi v5: records are flat (no attributes wrapper)
    const uniqueTypes = new Set<string>();
    if (data.data) {
      data.data.forEach((defect: any) => {
        // Support both Strapi v4 (attributes) and v5 (flat)
        const type = (defect.defect_type ?? defect.attributes?.defect_type ?? '').trim();
        if (type) {
          uniqueTypes.add(type);
        }
      });
    }
    return Array.from(uniqueTypes).sort();
  } catch (error) {
    console.error('Error fetching defect types:', error);
    return [];
  }
};

// Fetch all batches with their material (Strapi v5 — flat response)
export const fetchAllBatches = async (): Promise<any[]> => {
  try {
    const response = await fetch(
      `${API_BASE_URL}${api.endpoints.batches}?populate=*&publicationState=preview&sort=createdAt:desc&pagination[pageSize]=200`,
      {
        headers: getHeaders(),
        credentials: 'include',
      }
    );
    if (!response.ok) throw new Error('Failed to fetch batches');
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Error fetching all batches:', error);
    return [];
  }
};

export default api;