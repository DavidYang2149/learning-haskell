import React from "react";
import {
  Editor,
  EditorState,
  RichUtils,
  getDefaultKeyBinding,
  convertToRaw,
  convertFromRaw,
  SelectionState,
} from "draft-js";
import { stateToHTML } from "draft-js-export-html";
import "./RichText.css";
import "../../node_modules/draft-js/dist/Draft.css";
import Pusher from "pusher-js";
import axios from "axios";

class RichEditor extends React.Component {
  constructor(props) {
    super(props);
    this.state = { editorState: EditorState.createEmpty(), text: "" };
    this.focus = () => this.refs.editor.focus();
    this.onChange = editorState => {
      // update this line
      // onChange, update editor state then notify pusher of the new editorState
      this.setState({ editorState }, () => {
        // call the function to notify Pusher of the new editor state
        this.notifyPusher(
          stateToHTML(this.state.editorState.getCurrentContent())
        );
        this.notifyPusherEditor(this.state.editorState);
      });
    }; // update ends here
    this.handleKeyCommand = this._handleKeyCommand.bind(this);
    this.mapKeyToEditorCommand = this._mapKeyToEditorCommand.bind(this);
    this.toggleBlockType = this._toggleBlockType.bind(this);
    this.toggleInlineStyle = this._toggleInlineStyle.bind(this);
    this.getBlockStyle = this._getBlockStyle.bind(this);
    this.notifyPusher = this._notifyPusher.bind(this); // add this line
    this.notifyPusherEditor = this._notifyPusherEditor.bind(this); // add this line
  }

  _notifyPusher(text) {
    axios.post("http://localhost:5000/save-text", { text });
  }

  // send the editor's current state with axios to the server so it can be broadcasted by Pusher
  _notifyPusherEditor(editorState) {
    const selection = editorState.getSelection();
    let text = convertToRaw(editorState.getCurrentContent());
    axios.post("http://localhost:5000/editor-text", { text, selection });
  }

  componentWillMount() {
    this.pusher = new Pusher("807c08ca6d0caf9a08c9", {
      cluster: "ap3",
      encrypted: true,
    });
    this.channel = this.pusher.subscribe("editor");
  }

  componentDidMount() {
    let self = this;
    // listen to 'text-update' events
    this.channel.bind("text-update", function (data) {
      // update the text state with new data
      self.setState({ text: data.text });
    });
    // listen to 'editor-update' events
    this.channel.bind("editor-update", function (data) {
      // create a new selection state from new data
      let newSelection = new SelectionState({
        anchorKey: data.selection.anchorKey,
        anchorOffset: data.selection.anchorOffset,
        focusKey: data.selection.focusKey,
        focusOffset: data.selection.focusOffset,
      });
      // create new editor state
      let editorState = EditorState.createWithContent(
        convertFromRaw(data.text)
      );
      const newEditorState = EditorState.forceSelection(
        editorState,
        newSelection
      );
      // update the RichEditor's state with the newEditorState
      self.setState({ editorState: newEditorState });
    });
  }
  // handle blockquote
  _getBlockStyle(block) {
    switch (block.getType()) {
      case "blockquote":
        return "RichEditor-blockquote";
      default:
        return null;
    }
  }
  // handle key commands
  _handleKeyCommand(command, editorState) {
    const newState = RichUtils.handleKeyCommand(editorState, command);
    if (newState) {
      this.onChange(newState);
      return true;
    }
    return false;
  }
  // map the TAB key to the editor
  _mapKeyToEditorCommand(e) {
    if (e.keyCode === 9 /* TAB */) {
      const newEditorState = RichUtils.onTab(
        e,
        this.state.editorState,
        4 /* maxDepth */
      );
      if (newEditorState !== this.state.editorState) {
        this.onChange(newEditorState);
      }
      return;
    }
    return getDefaultKeyBinding(e);
  }
  // toggle block styles
  _toggleBlockType(blockType) {
    this.onChange(RichUtils.toggleBlockType(this.state.editorState, blockType));
  }
  // toggle inline styles
  _toggleInlineStyle(inlineStyle) {
    this.onChange(
      RichUtils.toggleInlineStyle(this.state.editorState, inlineStyle)
    );
  }

  render() {
    const { editorState } = this.state;

    // If the user changes block type before entering any text, we can
    // either style the placeholder or hide it. Let's just hide it now.
    let className = "RichEditor-editor";
    var contentState = editorState.getCurrentContent();
    if (!contentState.hasText()) {
      if (contentState.getBlockMap().first().getType() !== "unstyled") {
        className += " RichEditor-hidePlaceholder";
      }
    }

    return (
      <div className="container-fluid">
        <div className="row">
          <div className="RichEditor-root col-12 col-md-6">
            {/* render our editor block style controls components */}
            <BlockStyleControls
              editorState={editorState}
              onToggle={this.toggleBlockType}
            />
            {/* render our editor's inline style controls components */}
            <InlineStyleControls
              editorState={editorState}
              onToggle={this.toggleInlineStyle}
            />
            <div className={className} onClick={this.focus}>
              {/* render the Editor exposed by Draft.js */}
              <Editor
                blockStyleFn={this.getBlockStyle}
                customStyleMap={styleMap}
                editorState={editorState}
                handleKeyCommand={this.handleKeyCommand}
                keyBindingFn={this.mapKeyToEditorCommand}
                onChange={this.onChange}
                placeholder="What's on your mind?"
                ref="editor"
                spellCheck={true}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }
}

// Custom overrides for "code" style.
const styleMap = {
  CODE: {
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    fontFamily: '"Inconsolata", "Menlo", "Consolas", monospace',
    fontSize: 16,
    padding: 2,
  },
};

class StyleButton extends React.Component {
  constructor() {
    super();
    this.onToggle = e => {
      e.preventDefault();
      this.props.onToggle(this.props.style);
    };
  }

  render() {
    let className = "RichEditor-styleButton";
    if (this.props.active) {
      className += " RichEditor-activeButton";
    }

    return (
      <span className={className} onMouseDown={this.onToggle}>
        {this.props.label}
      </span>
    );
  }
}

const BLOCK_TYPES = [
  { label: "H1", style: "header-one" },
  { label: "H2", style: "header-two" },
  { label: "H3", style: "header-three" },
  { label: "H4", style: "header-four" },
  { label: "H5", style: "header-five" },
  { label: "H6", style: "header-six" },
  { label: "Blockquote", style: "blockquote" },
  { label: "UL", style: "unordered-list-item" },
  { label: "OL", style: "ordered-list-item" },
  { label: "Code Block", style: "code-block" },
];

const BlockStyleControls = props => {
  const { editorState } = props;
  const selection = editorState.getSelection();
  const blockType = editorState
    .getCurrentContent()
    .getBlockForKey(selection.getStartKey())
    .getType();

  return (
    <div className="RichEditor-controls">
      {BLOCK_TYPES.map(type => (
        <StyleButton
          key={type.label}
          active={type.style === blockType}
          label={type.label}
          onToggle={props.onToggle}
          style={type.style}
        />
      ))}
    </div>
  );
};

var INLINE_STYLES = [
  { label: "Bold", style: "BOLD" },
  { label: "Italic", style: "ITALIC" },
  { label: "Underline", style: "UNDERLINE" },
  { label: "Monospace", style: "CODE" },
];

const InlineStyleControls = props => {
  const currentStyle = props.editorState.getCurrentInlineStyle();

  return (
    <div className="RichEditor-controls">
      {INLINE_STYLES.map(type => (
        <StyleButton
          key={type.label}
          active={currentStyle.has(type.style)}
          label={type.label}
          onToggle={props.onToggle}
          style={type.style}
        />
      ))}
    </div>
  );
};

export default RichEditor;
