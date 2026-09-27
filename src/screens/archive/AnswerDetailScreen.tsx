import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAnswer, useIsOffline } from '../../app/AppServices.tsx';
import { paths, useAnswerRefs, useArcaNavigate, useRouteState } from '../../app/navigation.ts';
import { TransportFailure } from '../../data/failures.ts';
import {
  InlineStatus,
  PixelAppShell,
  PixelButton,
  PixelIconButton,
  PixelPlaceholder,
  RecordPanel,
  ScenePanel,
  ScreenTitle,
  StatePanel,
} from '../../ui/components.tsx';
import { copy, fill } from '../../ui/copy.ts';
import { formatDateKst, isWhitespaceOnly } from '../../ui/format.ts';

/**
 * F21 — memory detail (03 §6.2, 04 §6.10). Read-only in step 3: question snapshot first, full answer
 * as the main reading area. Edit/delete (F22/F23) arrive in step 6.
 */
export function AnswerDetailScreen() {
  const routeState = useRouteState();
  const refs = useAnswerRefs();
  const answerId = refs.resolve(routeState?.answerRef);
  const detail = useAnswer(answerId);
  const navigate = useArcaNavigate();
  const isOffline = useIsOffline();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!(detail.error instanceof TransportFailure)) return;
    let active = true;
    void isOffline().then((value) => {
      if (active) setOffline(value);
    });
    return () => {
      active = false;
    };
  }, [detail.error, isOffline]);

  // A reload drops the ref: go back to the parent and let the user choose again (06 §5.1).
  if (answerId === null) return <Navigate to={paths.archive} replace />;

  const header = (
    <div className="arca-screen-header">
      <PixelIconButton label={copy['CPY-COM-005']} glyph="‹" onClick={() => navigate(paths.archive)} />
      <ScreenTitle>{copy['CPY-F21-001']}</ScreenTitle>
    </div>
  );

  if (!detail.data) {
    return (
      <PixelAppShell>
        {header}
        {detail.isError ? (
          <StatePanel>
            <p>{offline ? copy['CPY-F21-012'] : copy['CPY-F21-011']}</p>
            <PixelButton variant="primary" loading={detail.isFetching} onClick={() => void detail.refetch()}>
              {copy['CPY-F21-013']}
            </PixelButton>
          </StatePanel>
        ) : (
          <RecordPanel>
            <PixelPlaceholder />
            <InlineStatus message={copy['CPY-F21-010']} />
          </RecordPanel>
        )}
      </PixelAppShell>
    );
  }

  const { question, content, createdDateKst, isEdited } = detail.data;
  return (
    <PixelAppShell>
      {header}
      <ScenePanel labelledBy="f21-question-label">
        <p className="arca-label" id="f21-question-label">
          {copy['CPY-F21-002']}
        </p>
        <p className="arca-question">{question.text}</p>
      </ScenePanel>
      <RecordPanel labelledBy="f21-answer-label">
        <p className="arca-label" id="f21-answer-label">
          {copy['CPY-F21-004']}
        </p>
        <p className="arca-user-text">{content}</p>
        {isWhitespaceOnly(content) && <p className="arca-text-secondary">{copy['CPY-COM-004']}</p>}
      </RecordPanel>
      <ul className="arca-meta">
        <li>{fill(copy['CPY-F21-006'], { createdDateKst: formatDateKst(createdDateKst) })}</li>
        {isEdited && <li>{copy['CPY-F21-007']}</li>}
      </ul>
    </PixelAppShell>
  );
}
