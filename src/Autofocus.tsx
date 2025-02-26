import * as THREE from 'three'
import React, {
  useRef,
  useContext,
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  RefObject,
} from 'react'
import { useThree, useFrame, createPortal } from '@react-three/fiber'
import { CopyPass, DepthPickingPass, DepthOfFieldEffect } from 'postprocessing'
import { DepthOfField, EffectComposerContext } from './index'
import { easing } from 'maath'

export type AutofocusProps = typeof DepthOfField & {
  target?: [number, number, number]
  mouse?: boolean
  debug?: number
  manual?: boolean
  smoothTime?: number
}

export type AutofocusApi = {
  dofRef: RefObject<DepthOfFieldEffect>
  hitpoint: THREE.Vector3
  update: (delta: number, updateTarget: boolean) => void
}

export const Autofocus = forwardRef<AutofocusApi, AutofocusProps>(
  (
    { target = undefined, mouse: followMouse = false, debug = undefined, manual = false, smoothTime = 0, ...props },
    fref
  ) => {
    const dofRef = useRef<DepthOfFieldEffect>(null)
    const hitpointRef = useRef<THREE.Mesh>(null)
    const targetRef = useRef<THREE.Mesh>(null)

    const scene = useThree(({ scene }) => scene)
    const pointer = useThree(({ pointer }) => pointer)
    const { composer, camera } = useContext(EffectComposerContext)

    // see: https://codesandbox.io/s/depthpickingpass-x130hg
    const [depthPickingPass] = useState(new DepthPickingPass())
    const [copyPass] = useState(new CopyPass())
    useEffect(() => {
      composer.addPass(depthPickingPass)
      composer.addPass(copyPass)
      return () => {
        composer.removePass(depthPickingPass)
        composer.removePass(copyPass)
      }
    }, [composer, depthPickingPass, copyPass])

    const [hitpoint] = useState(new THREE.Vector3(0, 0, 0))

    const [ndc] = useState(new THREE.Vector3(0, 0, 0))
    const getHit = useCallback(
      async (x: number, y: number) => {
        ndc.x = x
        ndc.y = y
        ndc.z = await depthPickingPass.readDepth(ndc)
        ndc.z = ndc.z * 2.0 - 1.0
        const hit = 1 - ndc.z > 0.0000001 // it is missed if ndc.z is close to 1
        return hit ? ndc.unproject(camera) : false
      },
      [ndc, depthPickingPass, camera]
    )

    const update = useCallback(
      async (delta: number, updateTarget = true) => {
        // Update hitpoint
        if (target) {
          hitpoint.set(...target)
        } else {
          const { x, y } = followMouse ? pointer : { x: 0, y: 0 }
          const hit = await getHit(x, y)
          if (hit) hitpoint.copy(hit)
        }

        // Update target
        if (updateTarget && dofRef.current?.target) {
          if (smoothTime > 0 && delta > 0) {
            easing.damp3(dofRef.current.target, hitpoint, smoothTime, delta)
          } else {
            dofRef.current.target.copy(hitpoint)
          }
        }
      },
      [target, hitpoint, followMouse, getHit, smoothTime, pointer]
    )

    useFrame(async (_, delta) => {
      if (!manual) {
        update(delta)
      }
      if (hitpointRef.current) {
        hitpointRef.current.position.copy(hitpoint)
      }
      if (targetRef.current && dofRef.current?.target) {
        targetRef.current.position.copy(dofRef.current.target)
      }
    })

    // Ref API
    useImperativeHandle(
      fref,
      () => ({
        dofRef,
        hitpoint,
        update,
      }),
      [hitpoint, update]
    )

    return (
      <>
        {debug
          ? createPortal(
              <>
                <mesh ref={hitpointRef}>
                  <sphereGeometry args={[debug, 16, 16]} />
                  <meshBasicMaterial color="#00ff00" opacity={1} transparent depthWrite={false} />
                </mesh>
                <mesh ref={targetRef}>
                  <sphereGeometry args={[debug / 2, 16, 16]} />
                  <meshBasicMaterial color="#00ff00" opacity={0.5} transparent depthWrite={false} />
                </mesh>
              </>,
              scene
            )
          : null}

        <DepthOfField ref={dofRef} {...props} target={hitpoint} />
      </>
    )
  }
)
