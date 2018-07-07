import React, { Component } from 'react'
import PropTypes from "prop-types";
import css from './layout.css';

export default class LocalVideoView extends Component {

    constructor(props) {
        super(props)
        this.state = {}
    }

    componentDidMount = () => {
        let video = this.refs[this.props.id];
        video.srcObject = this.props.stream;
        video.onplaying =  () => {
            this.setState({show_sping: false});
        };

        video.onloadedmetadata = function (e) {
            video.play();
        };
    }

    render() {

        const small = {
            position: 'absolute',
            width: '192px',
            height: '108px',
            bottom: '60px',
            right: '10px',
            borderWidth: `${this.state.minimize ? '0px' : '2px'}`,
            borderStyle: 'solid',
            borderColor: '#ffffff',
            overflow: 'hidden',
            zIndex: 99,
            borderRadius: '4px',
        };

        return (
            <div key={this.props.id}
                style={small}>
                {this.props.muted? <img src="assets/img/camera-off.svg" className={css.videoMuteImg}/> : null}
                <video ref={this.props.id} id={this.props.id} autoPlay playsInline muted="true"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', }} />
            </div>
        )
    }
}

LocalVideoView.propTypes = {
    stream: PropTypes.any.isRequired,//用户id
    id: PropTypes.string,//用户名
}
