import type { RepoInfo } from '../server/utils'

interface ReposResponse {
  count: number
  repositories: RepoInfo[]
}

export function useGitHub() {
  const fetchRepos = (options: { force?: boolean, lazy?: boolean } = {}) => {
    return useFetch<ReposResponse>('/api/github/repos', {
      query: { force: options.force },
      lazy: options.lazy,
    })
  }

  return { fetchRepos }
}
