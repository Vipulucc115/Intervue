import React, { Component } from "react";
import EditorComponent from "../Components/Editor/EditorComponent";
import axios from "axios";
import ReconnectingWebSocket from "reconnecting-websocket";
import shareDB from "sharedb/lib/client";
import StringBinding from "../EditorBinding/StringBinding";
import Loader from "../Components/Loader/Loading";
import { notification } from "antd";

const serverURL = process.env.REACT_APP_SERVER_URL;
const websocketURL = process.env.REACT_APP_WEB_SOCKET_URL;

class Editor extends Component {
  constructor(props) {
    super(props);
    this.state = {
      code: "",
      input: "",
      output: "",
      lang: "cpp",
      editor: null,
      monaco: null,
      binding: null,
      videoChat: false,
      runCodeDisabled: false,
      isLoading: true,
    };
  }

  componentDidMount() {
    const id = this.props.match.params.id;
    console.log("id is : " + id);
    axios
      .post(
        serverURL,
        {},
        {
          headers: {
            id: id,
          },
        }
      )
      .then((res) => {
        const rws = new ReconnectingWebSocket(websocketURL + "/bar");
        const connection = new shareDB.Connection(rws);
        const doc = connection.get("examples", id);

        doc.subscribe((err) => {
          if (err) throw err;
          const presence = connection.getPresence("examples");
          presence.subscribe((err) => {
            if (err) throw err;
          });
          const localPresence = presence.create();

          const binding = new StringBinding(
            this,
            doc,
            ["content"],
            localPresence
          );
          this.setState({ binding, isLoading: false }, () =>
            console.log("binding set")
          );
          binding.setup(this);

          presence.on("receive", (id, range) => {
            if (!range) return;
            const isPos =
              range.startLineNumber === range.endLineNumber &&
              range.startColumn === range.endColumn;
            binding.decorations = this.state.editor.deltaDecorations(
              binding.decorations,
              [
                {
                  range: new this.state.monaco.Range(
                    range.startLineNumber,
                    range.startColumn,
                    range.endLineNumber,
                    range.endColumn
                  ),
                  options: {
                    className: isPos ? "cursor-position" : "cursor-selection",
                  },
                },
              ]
            );
            binding.range = range;
          });
        });
      })
      .catch((err) => {
        console.log("Error occurred: " + err);
        notification.error({
          message: err.toString(),
        });
      });
  }

  editorDidMount = (editor, monaco) => {
    console.log("editor mount", this.state);
    editor.focus();
    editor.getModel().pushEOL(0);

    let setup = true;
    editor.onDidChangeCursorSelection((e) => {
      console.log("cursor change");
      if (setup) {
        const pos = editor.getPosition();
        editor.setSelection(
          new monaco.Range(
            pos.lineNumber,
            pos.column,
            pos.lineNumber,
            pos.column
          )
        );
        setup = false;
        return;
      }
      if (this.state.binding.localPresence) {
        this.state.binding.localPresence.submit(e.selection, (err) => {
          if (err) throw err;
        });
      }
    });

    this.setState({ editor, monaco });
  };

  editorOnChange = (newValue, e) => {
    console.log(this.state.binding);
    this.state.binding._inputListener(newValue, e);
    this.setState({ code: newValue });
  };

  handleRun = () => {
    this.setState({ runCodeDisabled: true });
    const code = this.state.editor.getValue();
    axios
      .post(serverURL + "/code/run", {
        code: code,
        input: this.state.input,
        id: this.props.match.params.id,
        //lang: this.state.editor.getModel().getLanguageIdentifier().language,
        lang: "cpp",
      })
      .then((response) => {
        console.log("Output generated: " + response.data);
        this.state.binding._inoutListener(
          this.state.output,
          response.data,
          "output"
        );
        this.setState({ output: response.data, runCodeDisabled: false });
      })
      .catch((err) => {
        if (!err.response) {
          notification.error({
            message: err.toString(),
          });
          this.setState({ runCodeDisabled: false });
        } else if (err.response.status === 400) {
          this.state.binding._inoutListener(
            this.state.output,
            err.response.data,
            "output"
          );
          this.setState({ output: err.response.data, runCodeDisabled: false });
        }
      });
  };

  handleInput = (e) => {
    this.state.binding._inoutListener(
      this.state.input,
      e.target.value,
      "input"
    );
    this.setState({ input: e.target.value });
  };

  handleLang = (value) => {
    this.state.binding._inoutListener(this.state.lang, value, "lang");
    this.setState({ lang: value });
  };

  handleVideoChat = () => {
    this.setState((prevState) => ({ videoChat: !prevState.videoChat }));
  };

  render() {
    const { videoChat, lang, code, input, output, runCodeDisabled, isLoading } =
      this.state;
    return (
      <React.Fragment>
        {isLoading && <Loader />}
        <EditorComponent
          videoChat={videoChat}
          lang={lang}
          code={code}
          input={input}
          output={output}
          runCodeDisabled={runCodeDisabled}
          readOnly={isLoading}
          handleVideoChat={this.handleVideoChat}
          editorDidMount={this.editorDidMount}
          editorOnChange={this.editorOnChange}
          handleLang={this.handleLang}
          handleRun={this.handleRun}
          handleInput={this.handleInput}
        />
      </React.Fragment>
    );
  }
}

export default Editor;
