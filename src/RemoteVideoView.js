import React, { Component } from 'react'
import PropTypes from "prop-types";

export default class RemoteVideoView extends Component {

    constructor(props) {
        super(props)
        this.state = {
            have_video: false,
            have_audio: false,
            volume: 0,
            clientWidth:document.body.offsetWidth,
            clientHeight:document.body.offsetHeight,
            resolutions :
			{
				width : 0,
				height: 0,
            },
        }
    }

    componentDidMount = () => {
        let video = this.refs[this.props.id];
        video.srcObject = this.props.stream;
        video.onloadedmetadata = function (e) {
            video.play();
        };
        this.setState({
            clientWidth:document.body.offsetWidth,
            clientHeight:document.body.offsetHeight,
        });
        window.addEventListener('resize', this.onWindowResize);
    }

    componentWillUnmount = () => {
        window.removeEventListener('resize', this.onWindowResize);
    }

    play = () => {
        let video  = this.refs[this.props.id];
        video.play();
    }

    onWindowResize = () => {
        this.setState({
            clientWidth:document.body.offsetWidth,
            clientHeight:document.body.offsetHeight,
        });
    }

    render() {
        const style = {
            left: '0px',
            right: '0px',
            top:'60px',
            bottom: '0px',
            backgroundColor: '#323232',
            position: 'absolute',
            zIndex: 0,
        }

        return (
            <div key={this.props.id} style={style}>
                <video ref={this.props.id} id={this.props.id} autoPlay playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
        )
    }
}

RemoteVideoView.propTypes = {
    stream: PropTypes.any.isRequired,
    id: PropTypes.string.isRequired,
}
