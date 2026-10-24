export default function Transfers({ transfers }) {
  return (
    <>
      <div className="head">
        <h2>Transfers</h2>
      </div>
      {transfers.length === 0 && <div className="empty">No transfers yet</div>}
      {transfers.slice(0, 5).map((t) => (
        <div className="transfer" key={t.id}>
          <div className="tline">
            <span className="name">
              {t.kind}: {t.name}
            </span>
            <span className={"state " + t.state}>{t.state === "running" ? t.percent + "%" : t.state}</span>
          </div>
          <div className="bar">
            <div className={"fill " + t.state} style={{ width: t.percent + "%" }} />
          </div>
        </div>
      ))}
    </>
  );
}
