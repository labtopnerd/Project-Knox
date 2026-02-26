export interface ApiError {
  error: string
  message: string
  statusCode: number
}

export interface ApiSuccess<T> {
  data: T
  message?: string
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  hasMore: boolean
}

export interface PaginatedResponse<T> {
  items: T[]
  meta: PaginationMeta
}
