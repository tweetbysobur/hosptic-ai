// MacBook Pro frame drawn in CSS around a real Hosptic screenshot. The screenshot keeps its own
// 16:10 ratio inside a browser window, so it is never stretched. Styles: styles/showcase.css (.mbp-*).

export default function MacBook({ src, srcSmall, alt, url = "usehosptic.vercel.app/app", width = 2880, height = 1800 }) {
  return (
    <div className="mbp">
      <div className="mbp-lid">
        <span className="mbp-camera" aria-hidden="true" />
        <div className="mbp-screen">
          <div className="mbp-browser" aria-hidden="true">
            <span className="mbp-dots"><i /><i /><i /></span>
            <span className="mbp-url">{url}</span>
          </div>
          <picture>
            {srcSmall && <source media="(max-width: 720px)" srcSet={srcSmall} />}
            <img src={src} width={width} height={height} alt={alt} className="mbp-shot" decoding="async" fetchPriority="high" />
          </picture>
        </div>
      </div>
      <div className="mbp-base" aria-hidden="true"><span className="mbp-notch" /></div>
    </div>
  );
}
