/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { DragDropContext, Droppable } from 'react-beautiful-dnd';
import { useDidUpdate } from '../../../../lib/hooks';
import { closePopup } from '../../../../lib/popup';

import selectors from '../../../../selectors';
import entryActions from '../../../../entry-actions';
import parseDndId from '../../../../utils/parse-dnd-id';
import DroppableTypes from '../../../../constants/DroppableTypes';
import { BoardMembershipRoles } from '../../../../constants/Enums';
import AddList from './AddList';
import List from '../../../lists/List';
import PlusMathIcon from '../../../../assets/images/plus-math-icon.svg?react';

import { resolveDrop, projectLayout } from './drag-layout';

import styles from './KanbanContent.module.scss';
import globalStyles from '../../../../styles.module.scss';

const KanbanContent = React.memo(() => {
  const listIds = useSelector(selectors.selectKanbanListIdsForCurrentBoard) || [];
  const selectListById = useMemo(() => selectors.makeSelectListById(), []);

  const lists = useSelector((state) =>
    listIds.map((id) => selectListById(state, id)).filter(Boolean),
  );

  const listsByColumn = lists.reduce((result, list) => {
    const columnId = list.columnId || list.id;

    return {
      ...result,
      [columnId]: [...(result[columnId] || []), list],
    };
  }, {});

  const columns = Object.entries(listsByColumn)
    .map(([id, columnLists]) => ({
      id,
      lists: [...columnLists].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
      position: Math.min(...columnLists.map((list) => list.columnPosition ?? list.position)),
    }))
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));

  const canAddList = useSelector((state) => {
    const isEditModeEnabled = selectors.selectIsEditModeEnabled(state); // TODO: move out?

    if (!isEditModeEnabled) {
      return isEditModeEnabled;
    }

    const boardMembership = selectors.selectCurrentUserMembershipForCurrentBoard(state);
    return !!boardMembership && boardMembership.role === BoardMembershipRoles.EDITOR;
  });

  const dispatch = useDispatch();
  const [t] = useTranslation();
  const [isAddListOpened, setIsAddListOpened] = useState(false);
  const [previewOffsets, setPreviewOffsets] = useState(null);
  const wrapperRef = useRef(null);
  const prevPositionRef = useRef(null);
  const dragRef = useRef(null);
  const frameRef = useRef(null);

  const handleDragStart = useCallback(
    ({ draggableId, source, type, mode }) => {
      document.body.classList.add(globalStyles.dragging);
      closePopup();
      if (type !== DroppableTypes.LIST || mode === 'SNAP') return;
      const id = parseDndId(draggableId);
      const snapshot = columns.map((column) => {
        const items = column.lists.map((list) => {
          const element = document.querySelector(`[data-rbd-draggable-id="list:${list.id}"]`);
          const rect = element.getBoundingClientRect();
          return {
            ...list,
            left: rect.left + window.scrollX,
            top: rect.top + window.scrollY,
            width: rect.width,
            height: rect.height,
          };
        });
        return {
          ...column,
          left: items[0].left,
          width: items[0].width,
          lists: items,
        };
      });
      const boardTop = wrapperRef.current.getBoundingClientRect().top + window.scrollY;
      dragRef.current = {
        id,
        source,
        columns: snapshot,
        boardTop,
        intent: null,
        newColumnId: `column:${id}:${Date.now()}`,
      };

      const tick = () => {
        const drag = dragRef.current;
        if (!drag || drag.released) return;
        const element = document.querySelector(`[data-rbd-draggable-id="list:${drag.id}"]`);
        if (element) {
          const rect = element.getBoundingClientRect();
          const point = {
            x: rect.left + rect.width / 2 + window.scrollX,
            y: rect.top + window.scrollY,
          };
          const valid =
            rect.bottom + window.scrollY >= drag.boardTop &&
            rect.top < window.innerHeight &&
            rect.left + rect.width / 2 >= 0 &&
            rect.left + rect.width / 2 <= window.innerWidth;
          const intent = valid ? resolveDrop(drag.columns, drag.id, point, drag.intent) : null;
          if (JSON.stringify(intent) !== JSON.stringify(drag.intent)) {
            drag.intent = intent;
            const projected = projectLayout(drag.columns, drag.id, intent);
            const offsets = {};
            let { left } = drag.columns[0];
            projected.forEach((column) => {
              let top = drag.boardTop;
              column.lists.forEach((list) => {
                if (list.id !== drag.id)
                  offsets[list.id] = { x: left - list.left, y: top - list.top };
                top += list.height + 8;
              });
              left += column.width + 16;
            });
            setPreviewOffsets(intent ? offsets : {});
          }
        }
        frameRef.current = requestAnimationFrame(tick);
      };
      setPreviewOffsets({});
      frameRef.current = requestAnimationFrame(tick);
    },
    [columns],
  );

  const handleDragEnd = useCallback(
    ({ draggableId, type, source, destination, reason }) => {
      document.body.classList.remove(globalStyles.dragging);
      cancelAnimationFrame(frameRef.current);
      const drag = dragRef.current;
      dragRef.current = null;
      setPreviewOffsets(null);
      if (reason !== 'DROP') return;
      const id = parseDndId(draggableId);
      if (type === DroppableTypes.LIST && drag) {
        if (!drag.intent) return;
        const projected = projectLayout(drag.columns, id, drag.intent);
        const columnIndex = projected.findIndex((column) =>
          column.lists.some((list) => list.id === id),
        );
        const target = projected[columnIndex];
        const listIndex = target.lists.findIndex((list) => list.id === id);
        const originalIndex = drag.columns.findIndex((column) =>
          column.lists.some((list) => list.id === id),
        );
        const original = drag.columns[originalIndex];
        if (
          (target.id === original.id ||
            (target.id === '__preview__' &&
              original.lists.length === 1 &&
              columnIndex === originalIndex)) &&
          listIndex === source.index
        )
          return;
        let columnId = target.id;
        let { position } = target;
        if (target.id === '__preview__') {
          columnId = original.lists.length === 1 ? original.id : drag.newColumnId;
          const previous = projected[columnIndex - 1];
          const next = projected[columnIndex + 1];
          const before = previous ? previous.position : 0;
          position = next ? before + (next.position - before) / 2 : before + 65536;
        }
        dispatch(entryActions.moveList(id, listIndex, columnId, position));
        return;
      }
      if (
        !destination ||
        (source.droppableId === destination.droppableId && source.index === destination.index)
      )
        return;
      if (type === DroppableTypes.CARD) {
        dispatch(entryActions.moveCard(id, parseDndId(destination.droppableId), destination.index));
      } else if (type === DroppableTypes.LIST) {
        const target = columns.find(
          (column) => `list-column-${column.id}` === destination.droppableId,
        );
        if (target)
          dispatch(entryActions.moveList(id, destination.index, target.id, target.position));
      }
    },
    [columns, dispatch],
  );

  useEffect(() => {
    // Freeze the visible preview before RBD starts its drop animation. Its animated
    // destination can differ from our two-dimensional insertion target.
    const freezeDrop = () => {
      if (dragRef.current) dragRef.current.released = true;
      cancelAnimationFrame(frameRef.current);
    };
    window.addEventListener('mouseup', freezeDrop, true);
    window.addEventListener('touchend', freezeDrop, true);
    return () => {
      window.removeEventListener('mouseup', freezeDrop, true);
      window.removeEventListener('touchend', freezeDrop, true);
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const handleAddListClick = useCallback(() => {
    setIsAddListOpened(true);
  }, []);

  const handleAddListClose = useCallback(() => {
    setIsAddListOpened(false);
  }, []);

  const handleMouseDown = useCallback((event) => {
    // If button is defined and not equal to 0 (left click)
    if (event.button) {
      return;
    }

    if (event.target !== wrapperRef.current && !event.target.dataset.dragScroller) {
      return;
    }

    prevPositionRef.current = event.clientX;

    window.getSelection().removeAllRanges();
    document.body.classList.add(globalStyles.dragScrolling);
  }, []);

  const handleWindowMouseMove = useCallback((event) => {
    if (prevPositionRef.current === null) {
      return;
    }

    event.preventDefault();

    window.scrollBy({
      left: prevPositionRef.current - event.clientX,
    });

    prevPositionRef.current = event.clientX;
  }, []);

  const handleWindowMouseRelease = useCallback(() => {
    if (prevPositionRef.current === null) {
      return;
    }

    prevPositionRef.current = null;
    document.body.classList.remove(globalStyles.dragScrolling);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleWindowMouseMove);

    window.addEventListener('mouseup', handleWindowMouseRelease);
    window.addEventListener('blur', handleWindowMouseRelease);
    window.addEventListener('contextmenu', handleWindowMouseRelease);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);

      window.removeEventListener('mouseup', handleWindowMouseRelease);
      window.removeEventListener('blur', handleWindowMouseRelease);
      window.removeEventListener('contextmenu', handleWindowMouseRelease);
    };
  }, [handleWindowMouseMove, handleWindowMouseRelease]);

  useDidUpdate(() => {
    if (isAddListOpened) {
      window.scroll(document.body.scrollWidth, 0);
    }
  }, [listIds, isAddListOpened]);

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div ref={wrapperRef} className={styles.wrapper} onMouseDown={handleMouseDown}>
      <div>
        <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div data-drag-scroller className={styles.lists}>
            {columns.map(({ id: columnId, lists: columnLists }) => (
              <React.Fragment key={columnId}>
                <Droppable
                  droppableId={`list-column-${columnId}`}
                  type={DroppableTypes.LIST}
                  direction="vertical"
                >
                  {({ innerRef, droppableProps, placeholder }) => (
                    <div
                      {...droppableProps} // eslint-disable-line react/jsx-props-no-spreading
                      data-drag-scroller
                      ref={innerRef}
                      className={styles.column}
                    >
                      {columnLists.map((list, index) => (
                        <div
                          key={list.id}
                          style={
                            previewOffsets
                              ? {
                                  height: dragRef.current?.columns
                                    .find((column) => column.id === columnId)
                                    ?.lists.find((item) => item.id === list.id)?.height,
                                }
                              : undefined
                          }
                        >
                          <List
                            id={list.id}
                            index={index}
                            previewOffset={
                              previewOffsets && (previewOffsets[list.id] || { x: 0, y: 0 })
                            }
                          />
                        </div>
                      ))}
                      <div style={previewOffsets ? { display: 'none' } : undefined}>
                        {placeholder}
                      </div>
                    </div>
                  )}
                </Droppable>
              </React.Fragment>
            ))}
            {canAddList && (
              <div data-drag-scroller className={styles.list}>
                {isAddListOpened ? (
                  <AddList onClose={handleAddListClose} />
                ) : (
                  <button
                    type="button"
                    className={styles.addListButton}
                    onClick={handleAddListClick}
                  >
                    <PlusMathIcon className={styles.addListButtonIcon} />
                    <span className={styles.addListButtonText}>
                      {listIds.length > 0 ? t('action.addAnotherList') : t('action.addList')}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        </DragDropContext>
      </div>
    </div>
  );
});

export default KanbanContent;
