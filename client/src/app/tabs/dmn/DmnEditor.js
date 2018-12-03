import React from 'react';

import { Fill } from '../../slot-fill';

import {
  DropdownButton,
  Icon,
  Loader
} from '../../primitives';

import {
  WithCache,
  WithCachedState,
  CachedComponent
} from '../../cached';

import PropertiesContainer from '../PropertiesContainer';

import CamundaDmnModeler from './DmnModeler';

import { active as isInputActive } from '../../../util/dom/is-input';

import {
  getDmnDrdEditMenu,
  getDmnDecisionTableEditMenu,
  getDmnLiteralExpressionEditMenu
} from './getDmnEditMenu';

import getDmnWindowMenu from './getDmnWindowMenu';

import css from './DmnEditor.less';

import generateImage from '../../util/generateImage';

import { assign } from 'min-dash';


export class DmnEditor extends CachedComponent {

  constructor(props) {
    super(props);

    this.state = { };

    this.ref = React.createRef();
    this.propertiesPanelRef = React.createRef();
  }

  componentDidMount() {
    this._isMounted = true;

    const {
      modeler
    } = this.getCached();

    this.listen('on');

    modeler.attachTo(this.ref.current);

    const activeViewer = modeler.getActiveViewer();

    if (activeViewer) {
      activeViewer.get('propertiesPanel').attachTo(this.propertiesPanelRef.current);
    }

    this.checkImport();
  }

  componentWillUnmount() {
    this._isMounted = false;

    const {
      modeler
    } = this.getCached();

    this.listen('off');

    modeler.detach();
  }

  componentDidUpdate() {
    const {
      onChanged
    } = this.props;

    const state = this.state;

    const {
      modeler
    } = this.getCached();

    const activeViewer = modeler.getActiveViewer(),
          activeView = modeler.getActiveView();

    if (!state.importing) {
      this.checkImport();
    }

    let editMenu;

    if (activeView) {
      if (activeView.type === 'drd') {
        editMenu = getDmnDrdEditMenu(state);
      } else if (activeView.type === 'decisionTable') {
        assign(state, {
          hasSelection: activeViewer.get('selection').hasSelection()
        });

        editMenu = getDmnDecisionTableEditMenu(state);
      } else if (activeView.type === 'literalExpression') {
        editMenu = getDmnLiteralExpressionEditMenu(state);
      }
    }

    const windowMenu = getDmnWindowMenu(state);

    if (typeof onChanged === 'function') {
      onChanged({
        ...state,
        editMenu,
        windowMenu
      });
    }
  }

  ifMounted = (fn) => {
    return (...args) => {
      if (this._isMounted) {
        fn(...args);
      }
    };
  }

  listen(fn) {
    const {
      modeler
    } = this.getCached();

    [
      'saveXML.done',
      'attach',
      'view.selectionChanged',
      'view.directEditingChanged'
    ].forEach((event) => {
      modeler[fn](event, this.handleChanged);
    });

    modeler[fn]('views.changed', this.viewsChanged);

    modeler[fn]('view.contentChanged', this.viewContentChanged);

    modeler[fn]('error', this.handleError);
  }

  checkDirty = () => {
    const {
      modeler
    } = this.getCached();

    return modeler.getViews().reduce((dirty, view) => {
      const viewer = modeler._getViewer(view);

      const commandStack = viewer.get('commandStack', false);

      if (!commandStack) {
        return dirty;
      }

      return dirty || commandStack.canUndo();
    }, false);
  }

  viewContentChanged = () => {
    this.handleChanged();

    this.props.onChanged(this.checkDirty());
  }

  handleImport = (error, warnings) => {

    const {
      activeSheet,
      onImport,
      xml
    } = this.props;

    const {
      modeler
    } = this.getCached();

    onImport(error, warnings);

    if (!error) {
      modeler.lastXML = xml;

      this.setState({
        importing: false
      });

      if (activeSheet && activeSheet.element) {
        return this.open(activeSheet.element);
      }

      const initialView = modeler._getInitialView(modeler._views);

      this.open(initialView.element);
    }

  }

  viewsChanged = ({ activeView, views }) => {

    const {
      onSheetsChanged
    } = this.props;

    const {
      modeler
    } = this.getCached();

    let activeSheet;

    const sheets = views.map(view => {
      const { element } = view;

      const newSheet = {
        element,
        id: element.id,
        name: getSheetName(view),
        order: -1
      };

      if (view === activeView) {
        activeSheet = newSheet;
      }

      return newSheet;
    });

    onSheetsChanged(sheets, activeSheet);

    const activeViewer = modeler.getActiveViewer();

    if (activeViewer) {
      activeViewer.get('propertiesPanel').attachTo(this.propertiesPanelRef.current);
    }

    // needs to be called last
    this.setCached({
      activeView,
      views
    });

    this.handleChanged();
  }

  undo = () => {
    const {
      modeler
    } = this.getCached();

    modeler.getActiveViewer().get('commandStack').undo();
  }

  redo = () => {
    const {
      modeler
    } = this.getCached();

    modeler.getActiveViewer().get('commandStack').redo();
  }

  handleChanged = () => {
    const {
      modeler
    } = this.getCached();

    const activeViewer = modeler.getActiveViewer(),
          activeView = modeler.getActiveView();

    if (!activeViewer) {
      return;
    }

    const commandStack = activeViewer.get('commandStack');

    const inputActive = isInputActive();

    const newState = {
      close: true,
      exportAs: 'saveSVG' in activeViewer ? [ 'svg', 'png' ] : false,
      propertiesPanel: true,
      redo: commandStack.canRedo(),
      save: true,
      undo: commandStack.canUndo()
    };

    const selection = activeViewer.get('selection');

    const selectionLength = selection.get().length;

    if (activeView.type === 'drd') {
      assign(newState, {
        editLabel: !inputActive && !!selectionLength,
        lassoTool: !inputActive,
        moveCanvas: !inputActive,
        moveSelection: !inputActive && !!selectionLength,
        removeSelected: false,
        zoom: true
      });
    }

    this.setState(newState);
  }

  handleError = (event) => {
    const {
      error
    } = event;

    const {
      onError
    } = this.props;

    onError(error);
  }

  handleModalOpened = () => {
    this.props.onModal('DEPLOY_DIAGRAM');
  }


  checkImport = () => {
    const {
      modeler
    } = this.getCached();

    const {
      activeSheet,
      xml
    } = this.props;

    if (xml !== modeler.lastXML) {
      this.setState({
        importing: true
      });

      modeler.importXML(xml, { open: false }, this.ifMounted(this.handleImport));
    } else {
      activeSheet
        && activeSheet.element
        && this.open(activeSheet.element);
    }
  }

  open = (element) => {
    const {
      activeView,
      modeler
    } = this.getCached();

    let view = modeler.getView(element);

    if (!view) {

      // try to find view based on ID
      // after re-import reference comparison won't work anymore
      view = modeler.getViews().find(view => view.element.id === element.id);
    }

    if (!view) {
      return;
    }

    if (!activeView
      || activeView.element !== element) {

      this.setCached({
        activeView: view
      });

      modeler.open(view);
    }
  }

  triggerAction = (action, options) => {
    const {
      modeler
    } = this.getCached();

    modeler.getActiveViewer()
      .get('editorActions')
      .trigger(action);
  }

  getXML() {
    const {
      modeler
    } = this.getCached();

    return new Promise((resolve, reject) => {

      modeler.saveXML({ format: true }, (err, xml) => {
        modeler.lastXML = xml;

        if (err) {
          this.handleError({
            error: err
          });

          return reject(err);
        }

        return resolve(xml);
      });
    });
  }

  exportAs(type) {
    const {
      modeler
    } = this.getCached();

    const viewer = modeler.getActiveViewer();

    return new Promise((resolve, reject) => {

      viewer.saveSVG((err, svg) => {
        let contents;

        if (err) {
          this.handleError({
            error: err
          });

          return reject(err);
        }

        if (type !== 'svg') {
          try {
            contents = generateImage(type, svg);
          } catch (err) {
            this.handleError({
              error: err
            });

            return reject(err);
          }
        } else {
          contents = svg;
        }

        resolve(contents);
      });

    });
  }

  render() {
    const {
      layout,
      onLayoutChanged
    } = this.props;

    const {
      importing,
    } = this.state;

    const {
      modeler
    } = this.getCached();

    const activeView = modeler.getActiveView();

    const hideIfCollapsed = activeView && activeView.type !== 'drd';

    return (
      <div className={ css.DmnEditor }>

        <Loader hidden={ !importing } />

        <Fill name="toolbar" group="deploy">
          <DropdownButton title="Deploy Current Diagram" items={ [{
            text: 'Deploy Current Diagram',
            onClick: this.handleModalOpened
          }] }>
            <Icon name="deploy" />
          </DropdownButton>
        </Fill>

        <div className="diagram" ref={ this.ref }></div>

        <PropertiesContainer
          className="properties"
          layout={ layout }
          ref={ this.propertiesPanelRef }
          hideIfCollapsed={ hideIfCollapsed }
          onLayoutChanged={ onLayoutChanged } />

      </div>
    );
  }

  static createCachedState() {
    const modeler = new CamundaDmnModeler();

    return {
      modeler,
      __destroy: () => {
        modeler.destroy();
      }
    };
  }

}

export default WithCache(WithCachedState(DmnEditor));

// helpers //////////

const viewNames = {
  decisionTable: 'Decision Table',
  literalExpression: 'Literal Expression'
};

function getSheetName(view) {
  if (view.type === 'drd') {
    return 'Diagram';
  }

  return view.element.name || viewNames[view.type];
}