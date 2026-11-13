/** Original POPP wordmark, drawn as geometry rather than a font dependency. */
export function Brand() {
  return (
    <div className="brand" role="img" aria-label="POPP Fitness">
      <svg className="brand-wordmark" viewBox="0 0 140 36" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M0 2h16c9 0 15 5 15 13s-6 13-15 13H9v6H0V2Zm9 8v10h7c4 0 6-2 6-5s-2-5-6-5H9ZM50 1c11 0 19 7 19 17s-8 17-19 17-19-7-19-17S39 1 50 1Zm0 8c-6 0-10 4-10 9s4 9 10 9 10-4 10-9-4-9-10-9ZM73 2h16c9 0 15 5 15 13s-6 13-15 13h-7v6h-9V2Zm9 8v10h7c4 0 6-2 6-5s-2-5-6-5h-7ZM108 2h16c9 0 15 5 15 13s-6 13-15 13h-7v6h-9V2Zm9 8v10h7c4 0 6-2 6-5s-2-5-6-5h-7Z"
        />
      </svg>
      <span className="brand-caption">Fitness</span>
    </div>
  )
}
